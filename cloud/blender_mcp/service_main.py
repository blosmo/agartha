"""Executable entrypoint for the upstream Streamable HTTP adapter."""
from __future__ import annotations

from .config import HTTP_PORT
from .service import create_app


def main() -> None:
    import uvicorn  # type: ignore
    app, _activity, _store = create_app()
    uvicorn.run(app, host="0.0.0.0", port=HTTP_PORT, log_level="warning")


if __name__ == "__main__":
    main()
