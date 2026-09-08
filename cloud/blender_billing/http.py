"""Stateless MCP and session HTTP surface for the trusted paid broker."""
from __future__ import annotations

import json
import re
import hashlib
import uuid
from typing import Any, Callable

from starlette.applications import Starlette
from starlette.concurrency import run_in_threadpool
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route

from .broker import Broker, BrokerConflict, DEFAULT_RESPONSE_BYTES
from .ledger import LedgerError


def public_session(row: dict[str, Any]) -> dict[str, Any]:
    fields = ("reservationId", "projectId", "status", "reservedMinutes", "reservedCents", "chargedCents", "releasedCents", "readyAt", "stoppedAt", "stopRequested", "responseBytesUsed")
    return {field: row[field] for field in fields if field in row}


def create_http_app(broker: Broker, monitor: Callable[[str], None]) -> Starlette:
    def token(request: Request) -> str:
        auth = request.headers.get("authorization", "")
        if not re.fullmatch(r"Bearer [a-f0-9]{64}", auth):
            raise LedgerError(401)
        return auth[7:]

    async def dispatch(request: Request) -> Response:
        try:
            credential = token(request)
            reservation_id = request.path_params["reservation_id"]
            if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", reservation_id):
                return JSONResponse({"error": "Invalid reservation ID."}, status_code=400)
            if request.url.path.startswith("/sessions/"):
                if "name" in request.path_params:
                    name = request.path_params["name"]
                    if not re.fullmatch(r"[A-Za-z0-9_-]{1,80}\.(glb|png|blend)", name):
                        raise ValueError("Invalid export filename.")
                    limit = int(request.headers.get("x-agartha-response-limit", str(DEFAULT_RESPONSE_BYTES)))
                    payload = await run_in_threadpool(broker.download, credential, reservation_id, name, limit)
                    media_type = "image/png" if name.endswith('.png') else "model/gltf-binary" if name.endswith('.glb') else "application/octet-stream"
                    return Response(payload, media_type=media_type, headers={"Content-Disposition": f'attachment; filename="{name}"', "Cache-Control": "no-store"})
                elif request.method == "GET":
                    row = await run_in_threadpool(broker.owned, credential, reservation_id)
                elif request.url.path.endswith("/start"):
                    await run_in_threadpool(broker.owned, credential, reservation_id)
                    try:
                        row = await run_in_threadpool(broker.start, credential, reservation_id)
                    finally:
                        # Persisted ledger claims make duplicate monitors harmless.
                        await run_in_threadpool(monitor, reservation_id)
                elif request.url.path.endswith("/stop"):
                    row = await run_in_threadpool(broker.stop, credential, reservation_id)
                else:
                    return JSONResponse({"error": "Unknown session operation."}, status_code=404)
                return JSONResponse(public_session(row), headers={"Cache-Control": "no-store"})
            body = bytearray()
            async for chunk in request.stream():
                body.extend(chunk)
                if len(body) > 65_536:
                    return JSONResponse({"error": "MCP request exceeds 64 KiB."}, status_code=413)
            message = json.loads(body)
            if not isinstance(message, dict) or message.get("jsonrpc") != "2.0":
                raise ValueError("Expected a JSON-RPC 2.0 request.")
            request_id = message.get("id")
            method = message.get("method")
            await run_in_threadpool(broker.owned, credential, reservation_id)
            if method == "notifications/initialized" and request_id is None:
                return Response(status_code=202)
            if type(request_id) not in (str, int) or len(str(request_id)) > 128:
                raise ValueError("An MCP request ID is required.")
            if method == "initialize":
                version = message.get("params", {}).get("protocolVersion")
                supported = {"2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"}
                result = {"protocolVersion": version if version in supported else "2025-06-18", "capabilities": {"tools": {}}, "serverInfo": {"name": "agartha-paid-blender", "version": "1.0.0"}, "instructions": "Fund and start this reservation before calling Blender tools. Running idle time is billed. Stop explicitly to save and settle."}
                return JSONResponse({"jsonrpc": "2.0", "id": request_id, "result": result}, headers={"Cache-Control": "no-store", "Mcp-Session-Id": uuid.uuid4().hex})
            elif method == "ping":
                result = {}
            elif method in {"tools/list", "tools/call"}:
                session_id = request.headers.get('mcp-session-id')
                if session_id is not None and not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', session_id):
                    raise ValueError('Invalid MCP session ID.')
                scoped_id = hashlib.sha256(f'{session_id}:{json.dumps(request_id)}'.encode()).hexdigest() if session_id else uuid.uuid4().hex
                operation_id = request.headers.get("x-agartha-operation-id", scoped_id)
                if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", operation_id):
                    raise ValueError("Invalid operation ID.")
                limit = int(request.headers.get("x-agartha-response-limit", str(DEFAULT_RESPONSE_BYTES)))
                frame = await run_in_threadpool(broker.call, credential, reservation_id, message, operation_id, limit)
                if "error" in frame:
                    # Worker messages are untrusted; preserve them as a tool error, not service authority.
                    result = {"isError": True, "content": [{"type": "text", "text": "Blender could not complete this operation."}]}
                else:
                    result = frame["result"]
            else:
                return JSONResponse({"jsonrpc": "2.0", "id": request_id, "error": {"code": -32601, "message": "Method not found."}})
            return JSONResponse({"jsonrpc": "2.0", "id": request_id, "result": result}, headers={"Cache-Control": "no-store"})
        except LedgerError as error:
            return JSONResponse({"error": "Billing authorization or reservation check failed."}, status_code=error.status if 400 <= error.status <= 599 else 503)
        except BrokerConflict as error:
            return JSONResponse({"error": str(error)}, status_code=409)
        except (ValueError, TypeError, KeyError):
            return JSONResponse({"error": "Invalid Blender request."}, status_code=400)
        except Exception:
            return JSONResponse({"error": "Blender request could not complete. Observe the session before retrying."}, status_code=503)

    return Starlette(routes=[
        Route("/sessions/{reservation_id}", dispatch, methods=["GET"]),
        Route("/sessions/{reservation_id}/start", dispatch, methods=["POST"]),
        Route("/sessions/{reservation_id}/stop", dispatch, methods=["POST"]),
        Route("/sessions/{reservation_id}/artifacts/{name}", dispatch, methods=["GET"]),
        Route("/mcp/{reservation_id}", dispatch, methods=["POST"]),
    ])
