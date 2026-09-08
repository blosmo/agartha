"""Bounded stdin/stdout bridge for the private paid Blender worker.

The worker has no public listener.  The broker transports newline-delimited
JSON frames over the Modal SDK execution channel.  This module deliberately
does not translate MCP tools: schemas and ``CallToolResult`` values come from
the pinned upstream FastMCP server unchanged.
"""
from __future__ import annotations

import asyncio
import contextlib
import inspect
import json
import logging
import sys
from dataclasses import is_dataclass, asdict
from typing import Any, BinaryIO, Sequence

from cloud.blender_mcp.config import MAX_SCRIPT_BYTES
from cloud.blender_mcp.service import filter_tools, load_upstream

LOG = logging.getLogger(__name__)
MAX_REQUEST_BYTES = MAX_SCRIPT_BYTES * 2
MAX_RESPONSE_BYTES = 268_435_456


class BridgeProtocolError(ValueError):
    """A malformed or over-sized bridge frame."""


def _json_value(value: Any) -> Any:
    """Convert MCP/Pydantic values without dropping result fields."""
    if hasattr(value, "model_dump"):
        return _json_value(value.model_dump(mode="json"))
    if is_dataclass(value):
        return _json_value(asdict(value))
    if isinstance(value, dict):
        return {str(key): _json_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_value(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    raise TypeError(f"Bridge result is not JSON serializable: {type(value).__name__}")


def _call_result(value: Any) -> Any:
    """Normalize FastMCP's public result to the wire-level MCP result shape."""
    structured_pair = isinstance(value, tuple) and len(value) == 2 and isinstance(value[0], (list, tuple)) and (value[1] is None or isinstance(value[1], dict))
    try:
        from mcp.types import CallToolResult, TextContent
    except ImportError:
        # The worker image always contains MCP; keeping this fallback makes the
        # protocol tests runnable in the repository's lightweight Python env.
        if structured_pair:
            return {"content": list(value[0]), "structuredContent": value[1], "isError": False}
        if isinstance(value, dict) and {"content", "structuredContent", "isError"} <= value.keys():
            return value
        if isinstance(value, dict):
            return {"content": [{"type": "text", "text": json.dumps(value)}], "structuredContent": value, "isError": False}
        return {"content": list(value) if isinstance(value, Sequence) else [], "isError": False}
    if isinstance(value, CallToolResult):
        return value
    if structured_pair:
        return CallToolResult(content=list(value[0]), structuredContent=value[1], isError=False)
    if isinstance(value, dict):
        return CallToolResult(
            content=[TextContent(type="text", text=json.dumps(value, separators=(",", ":")))],
            structuredContent=value,
            isError=False,
        )
    return CallToolResult(content=list(value) if isinstance(value, Sequence) else [], isError=False)


def encode_frame(value: Any, *, max_bytes: int = MAX_RESPONSE_BYTES) -> bytes:
    try:
        encoded = json.dumps(_json_value(value), separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    except (TypeError, ValueError) as error:
        raise BridgeProtocolError("Bridge value is not JSON serializable") from error
    if len(encoded) > max_bytes:
        raise BridgeProtocolError("Bridge frame exceeds the configured byte limit")
    return encoded + b"\n"


def decode_frame(raw: bytes, *, max_bytes: int = MAX_REQUEST_BYTES) -> dict[str, Any]:
    if len(raw) > max_bytes:
        raise BridgeProtocolError("Bridge request exceeds the configured byte limit")
    try:
        value = json.loads(raw)
    except (TypeError, json.JSONDecodeError) as error:
        raise BridgeProtocolError("Bridge request is not valid JSON") from error
    if not isinstance(value, dict):
        raise BridgeProtocolError("Bridge request must be a JSON object")
    return value


class WorkerBridge:
    """Dispatch the narrow MCP methods needed by the trusted broker."""

    def __init__(self, server: Any | None = None) -> None:
        self.server = server or load_upstream()
        if server is None:
            filter_tools(self.server)

    async def dispatch(self, request: dict[str, Any]) -> Any:
        method = request.get("method")
        if method == "tools/list":
            list_tools = getattr(self.server, "list_tools", None)
            if list_tools is None:
                raise RuntimeError("Upstream FastMCP list_tools API is unavailable")
            tools = list_tools()
            tools = await tools if inspect.isawaitable(tools) else tools
            return {"tools": [_json_value(tool) for tool in tools]}
        if method != "tools/call":
            raise BridgeProtocolError(f"Unsupported bridge method: {method!r}")
        params = request.get("params")
        if not isinstance(params, dict) or not isinstance(params.get("name"), str):
            raise BridgeProtocolError("tools/call requires params.name")
        arguments = params.get("arguments", {})
        if not isinstance(arguments, dict):
            raise BridgeProtocolError("tools/call params.arguments must be an object")
        call_tool = getattr(self.server, "call_tool", None)
        if call_tool is None:
            raise RuntimeError("Upstream FastMCP call_tool API is unavailable")
        result = call_tool(params["name"], arguments)
        result = await result if inspect.isawaitable(result) else result
        return _call_result(result)

    async def serve(self, input_stream: BinaryIO, output_stream: BinaryIO) -> None:
        while True:
            raw = input_stream.readline(MAX_REQUEST_BYTES + 1)
            if not raw:
                return
            if len(raw) > MAX_REQUEST_BYTES and not raw.endswith(b"\n"):
                raise BridgeProtocolError("Bridge request exceeds the configured byte limit")
            request = decode_frame(raw.rstrip(b"\r\n"))
            request_id = request.get("id")
            try:
                with contextlib.redirect_stdout(sys.stderr):
                    result = await self.dispatch(request)
                response: dict[str, Any] = {"id": request_id, "result": _json_value(result)}
            except Exception as error:  # keep the transport alive for broker retries
                LOG.exception("Paid Blender bridge request failed")
                response = {"id": request_id, "error": {"message": str(error)[:512], "type": type(error).__name__}}
            output_stream.write(encode_frame(response))
            output_stream.flush()


def main() -> None:
    logging.basicConfig(stream=sys.stderr, level=logging.WARNING)
    asyncio.run(WorkerBridge().serve(sys.stdin.buffer, sys.stdout.buffer))


if __name__ == "__main__":
    main()
