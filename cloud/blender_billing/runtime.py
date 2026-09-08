"""Paid worker entrypoint: persistent Blender supervisor plus private bridge."""
from __future__ import annotations

import os

from cloud.blender_mcp.supervisor import run_supervisor


def main() -> None:
    # The broker owns idle billing and TTL.  Keep the supervisor alive for the
    # whole reservation and use the bridge as its inherited stdin/stdout child.
    ttl = int(os.environ["AGARTHA_PAID_TTL_SECONDS"])
    if ttl < 1:
        raise ValueError("AGARTHA_PAID_TTL_SECONDS must be positive")
    raise SystemExit(run_supervisor(
        idle_seconds=ttl,
        max_seconds=ttl,
        # Per-request bridge execs use the inherited Blender process.  The
        # supervisor child must stay alive without consuming the Sandbox stdin;
        # otherwise startup stdin EOF would make the bridge exit immediately.
        service_command=("python", "-c", "import os,time; time.sleep(int(os.environ['AGARTHA_PAID_TTL_SECONDS']))"),
    ))


if __name__ == "__main__":
    main()
