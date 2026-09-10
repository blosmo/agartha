"""Executable entrypoint for the upstream Streamable HTTP adapter."""
from __future__ import annotations

import argparse
from pathlib import Path

from .config import HTTP_PORT
from .service import create_app


def main() -> None:
    import uvicorn  # type: ignore
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace", type=Path)
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=HTTP_PORT)
    parser.add_argument("--require-token", action="store_true")
    parser.add_argument("--strict-transport", action="store_true")
    args = parser.parse_args()
    app, _activity, _store = create_app(
        workspace=args.workspace,
        require_token=args.require_token,
        strict_transport=args.strict_transport,
    )
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
