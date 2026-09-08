"""Private, bounded transport from the trusted broker to Convex."""
from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


class LedgerError(RuntimeError):
    def __init__(self, status: int, code: str = "") -> None:
        super().__init__(f"Billing ledger rejected the operation ({status}).")
        self.status = status
        self.code = code


class LedgerClient:
    def __init__(self, site_url: str, gateway_key: str, broker_key: str) -> None:
        parsed = urllib.parse.urlparse(site_url)
        if parsed.scheme != "https" or parsed.username or parsed.password:
            raise ValueError("The billing ledger must use a trusted HTTPS origin.")
        if not gateway_key or not broker_key:
            raise ValueError("Billing gateway and broker credentials are required.")
        self.base = f"https://{parsed.netloc}"
        self.headers = {"Content-Type": "application/json", "x-agartha-billing-key": gateway_key, "x-agartha-broker-key": broker_key}

    def call(self, operation: str, **arguments: Any) -> Any:
        if not re.fullmatch(r"[A-Za-z]+", operation):
            raise ValueError("Invalid billing operation.")
        body = json.dumps(arguments, separators=(",", ":"), allow_nan=False).encode()
        if len(body) > 16_384:
            raise ValueError("Billing request is too large.")
        request = urllib.request.Request(f"{self.base}/billing/api/{operation}", data=body, headers=self.headers, method="POST")
        # Refuse redirects rather than forwarding private service authority.
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *_args: Any, **_kwargs: Any) -> None:
                return None
        try:
            with urllib.request.build_opener(NoRedirect()).open(request, timeout=15) as response:
                raw = response.read(65_537)
                if len(raw) > 65_536:
                    raise LedgerError(502)
                return json.loads(raw)
        except urllib.error.HTTPError as error:
            code = ""
            try:
                data = json.loads(error.read(4096))
                if isinstance(data, dict) and isinstance(data.get("code"), str):
                    code = data["code"][:80]
            except (ValueError, OSError):
                pass
            raise LedgerError(error.code, code) from None
        except (urllib.error.URLError, TimeoutError, ValueError):
            raise LedgerError(503) from None
