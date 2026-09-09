"""Trusted orchestration. Worker output never authorizes money or lifecycle."""
from __future__ import annotations

import hashlib
import io
import json
import logging
import os
import shutil
import time
import uuid
from pathlib import Path
from typing import Any, Callable

from .ledger import LedgerClient
from .provider import ModalProvider
from .durable_storage import StorageCoordinator, storage_transaction

MAX_RESPONSE_BYTES = 268_435_456
DEFAULT_RESPONSE_BYTES = 16_777_216
TOOL_TIMEOUT_SECONDS = 90


class BrokerConflict(RuntimeError):
    pass


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


class ResultStore:
    """Immutable, private retry results on the trusted broker's durable volume."""
    def __init__(self, root: Path, commit: Callable[[], None] = lambda: None, storage: StorageCoordinator | None = None) -> None:
        self.root = root
        self.commit = commit
        self.storage = storage or StorageCoordinator()

    @storage_transaction
    def write(self, reservation_id: str, operation_id: str, result: dict[str, Any], limit: int) -> tuple[str, int]:
        payload = json.dumps(result, separators=(",", ":"), allow_nan=False).encode()
        if len(payload) > limit:
            raise ValueError("Result exceeds the accepted response limit.")
        reference = f"{digest(reservation_id)}/{digest(operation_id)}"
        directory = self.root / digest(reservation_id)
        directory.mkdir(parents=True, exist_ok=True)
        target = self.root / reference
        # UUID temporary names prevent incomplete writes appearing as completed results.
        temporary = directory / f".{uuid.uuid4().hex}"
        try:
            with temporary.open("xb") as handle:
                handle.write(payload)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, target)
            self.commit()
        finally:
            temporary.unlink(missing_ok=True)
        return reference, len(payload)

    @storage_transaction
    def read(self, reference: str, limit: int) -> dict[str, Any]:
        parts = reference.split("/")
        if len(parts) != 2 or any(len(part) != 64 or any(c not in "0123456789abcdef" for c in part) for part in parts):
            raise ValueError("Invalid result reference.")
        with (self.root / reference).open("rb") as handle:
            raw = handle.read(limit + 1)
        if len(raw) > limit:
            raise ValueError("Saved result exceeds the accepted response limit.")
        return json.loads(raw)

    @storage_transaction
    def purge(self, reservation_id: str) -> None:
        shutil.rmtree(self.root / digest(reservation_id), ignore_errors=True)
        self.commit()


class Broker:
    def __init__(self, ledger: LedgerClient, provider: ModalProvider, results: ResultStore,
                 projects: Any, clock: Callable[[], float] = time.time) -> None:
        self.ledger = ledger
        self.provider = provider
        self.results = results
        self.projects = projects
        self.clock = clock

    def _row(self, reservation_id: str) -> dict[str, Any]:
        return self.ledger.call("getReservationForBroker", reservationId=reservation_id)

    def owned(self, token: str, reservation_id: str) -> dict[str, Any]:
        return self.ledger.call("getReservation", token=token, reservationId=reservation_id)

    def start(self, token: str, reservation_id: str) -> dict[str, Any]:
        self.owned(token, reservation_id)
        return self._start(reservation_id)

    def _start(self, reservation_id: str) -> dict[str, Any]:
        row = self._row(reservation_id)
        if row["status"] == "running":
            return row
        if row["status"] not in {"reserved", "launching"} or row.get("stopRequested"):
            raise BrokerConflict("Reservation cannot be launched.")
        if row["status"] == "reserved":
            generation = row["launchGeneration"] + 1
            self.ledger.call("claimLaunch", reservationId=reservation_id, launchGeneration=generation,
                             operationId=f"launch-{digest(reservation_id)}-{generation}")
            row = self._row(reservation_id)
        generation = row["launchGeneration"]
        worker_id = row.get("providerWorkerId")
        if self.clock() * 1000 >= row["launchClaimedAt"] + 60_000:
            if not worker_id:
                worker_id = self.provider.lookup_worker(reservation_id, generation)
                if worker_id:
                    self.ledger.call("attachWorker", reservationId=reservation_id, launchGeneration=generation, workerId=worker_id)
            if worker_id:
                return self._stop(reservation_id)
            self.ledger.call("settleSession", reservationId=reservation_id, launchGeneration=generation,
                             terminalState="unknown", stoppedAt=int(self.clock() * 1000), startupFailed=False)
            raise BrokerConflict("Launch outcome is uncertain; credits remain held for reconciliation.")
        claim = self.ledger.call("claimStartup", reservationId=reservation_id, launchGeneration=generation, executorId=uuid.uuid4().hex)
        if not claim.get("claimed"):
            return self._row(reservation_id)
        try:
            if not worker_id:
                worker_id = self.provider.ensure_worker(reservation_id, generation, row["launchClaimedAt"] / 1000, row["reservedMinutes"])
                self.ledger.call("attachWorker", reservationId=reservation_id, launchGeneration=generation, workerId=worker_id)
            deadline = row["launchClaimedAt"] / 1000 + 60
            while self.clock() < deadline:
                current = self._row(reservation_id)
                if current.get("stopRequested"):
                    raise BrokerConflict("Launch was canceled.")
                if current["status"] == "running":
                    return current
                if current["status"] != "launching" or current["launchGeneration"] != generation:
                    raise BrokerConflict("Launch claim has changed.")
                if self.provider.poll(worker_id) is not None:
                    raise RuntimeError("Blender worker stopped during startup.")
                if self.provider.ready(worker_id):
                    self.projects.restore(row, worker_id)
                    self.ledger.call("markSessionReady", reservationId=reservation_id, launchGeneration=generation, readyAt=int(self.clock() * 1000))
                    self.projects.activate(self._row(reservation_id))
                    return self._row(reservation_id)
                time.sleep(0.25)
            raise TimeoutError("Blender startup exceeded its allowance.")
        except Exception:
            logging.getLogger(__name__).exception("Paid Blender startup did not complete")
            current = self._row(reservation_id)
            if current["status"] == "running" and current["launchGeneration"] == generation:
                return current
            # A failed HTTP/SDK call does not prove that the worker stopped.
            if worker_id:
                try:
                    self.provider.stop(worker_id)
                    if self.provider.poll(worker_id) is not None:
                        self.ledger.call("recordLaunchFailure", reservationId=reservation_id, launchGeneration=generation, reason="Worker startup failed after confirmed termination.")
                        return self._row(reservation_id)
                except Exception:
                    pass
            self.ledger.call("settleSession", reservationId=reservation_id, launchGeneration=generation,
                             terminalState="unknown", stoppedAt=int(self.clock() * 1000), startupFailed=False)
            raise

    def stop(self, token: str, reservation_id: str) -> dict[str, Any]:
        row = self.owned(token, reservation_id)
        if row["status"] in {"settled", "failed"}:
            return row
        self.ledger.call("requestStop", token=token, reservationId=reservation_id)
        canceled = self._row(reservation_id)
        if canceled["status"] in {"settled", "failed"}:
            return canceled
        return self._stop(reservation_id)

    def _stop(self, reservation_id: str, *, idle_only: bool = False) -> dict[str, Any]:
        row = self._row(reservation_id)
        executor = uuid.uuid4().hex
        claim_args = {"reservationId": reservation_id, "launchGeneration": row["launchGeneration"], "executorId": executor}
        if idle_only:
            claim_args["idleOnly"] = True
        claim = self.ledger.call("claimShutdown", **claim_args)
        if not claim.get("claimed"):
            return row
        worker_id = row.get("providerWorkerId")
        if not worker_id:
            worker_id = self.provider.lookup_worker(reservation_id, row["launchGeneration"])
            if not worker_id:
                raise BrokerConflict("Worker termination has not been confirmed; credits remain held for operator reconciliation.")
            self.ledger.call("attachWorker", reservationId=reservation_id, launchGeneration=row["launchGeneration"], workerId=worker_id)
        def heartbeat():
            self.ledger.call("renewShutdown", reservationId=reservation_id, launchGeneration=row["launchGeneration"], executorId=executor)
        try:
            if self.provider.poll(worker_id) is None:
                try:
                    if row.get("readyAt") is not None and claim.get("checkpointAllowed", True):
                        self.projects.checkpoint(row, worker_id, heartbeat)
                finally:
                    heartbeat()
                    self.provider.stop(worker_id)
            if self.provider.poll(worker_id) is None:
                raise RuntimeError("Worker termination has not completed.")
        except Exception:
            current = self._row(reservation_id)
            if current["status"] in {"settled", "failed"} or (current.get("stopExecutorId") and current["stopExecutorId"] != executor):
                return current
            self.ledger.call("settleSession", reservationId=reservation_id, launchGeneration=row["launchGeneration"],
                             terminalState="unknown", stoppedAt=int(self.clock() * 1000), startupFailed=False)
            raise
        if row.get("readyAt") is None:
            self.ledger.call("recordLaunchFailure", reservationId=reservation_id, launchGeneration=row["launchGeneration"], reason="Stopped before readiness.")
        else:
            self.ledger.call("settleSession", reservationId=reservation_id, launchGeneration=row["launchGeneration"],
                             terminalState="confirmed", stoppedAt=int(self.clock() * 1000), startupFailed=False)
        self.results.purge(reservation_id)
        if row.get("readyAt") is not None:
            self.projects.collect(row["projectId"])
        return self._row(reservation_id)

    def reconcile(self, reservation_id: str) -> dict[str, Any]:
        row = self._row(reservation_id)
        if row["status"] == "reserved" and row.get("deferredStart") and not row.get("stopRequested"):
            return row
        if row["status"] in {"settled", "failed"}:
            return row
        if row["status"] in {"reserved", "launching"} and not row.get("stopRequested"):
            return self._start(reservation_id)
        now = int(self.clock() * 1000)
        deadline = row.get("launchClaimedAt", now) + row["reservedMinutes"] * 60_000 + 60_000
        active_operation_deadline = row.get("activeOperationDeadline")
        operation_active = isinstance(active_operation_deadline, (int, float)) and now < active_operation_deadline
        idle = now - row.get("lastActivityAt", now) >= 60_000 and not operation_active
        worker_id = row.get("providerWorkerId")
        terminal = worker_id is not None and self.provider.poll(worker_id) is not None
        if row.get("stopRequested") or row["status"] == "unknown" or now >= deadline or terminal:
            return self._stop(reservation_id)
        if idle:
            return self._stop(reservation_id, idle_only=True)
        return row

    def call(self, token: str, reservation_id: str, request: dict[str, Any], operation_id: str,
             response_limit: int = DEFAULT_RESPONSE_BYTES) -> dict[str, Any]:
        row = self.owned(token, reservation_id)
        if row["status"] != "running" or row.get("stopRequested"):
            raise BrokerConflict("Start a funded session before using Blender tools.")
        if request.get("method") not in {"tools/list", "tools/call"}:
            raise ValueError("Unsupported modeling operation.")
        if type(response_limit) is not int or not 1 <= response_limit <= MAX_RESPONSE_BYTES:
            raise ValueError("Invalid response byte limit.")
        canonical = json.dumps({key: value for key, value in request.items() if key not in {"id", "jsonrpc"}}, sort_keys=True, separators=(",", ":"), allow_nan=False)
        operation_key = digest(f"{reservation_id}:{operation_id}")
        grant = self.ledger.call("authorizeOperation", reservationId=reservation_id, launchGeneration=row["launchGeneration"],
                                 operationId=operation_key, payloadFingerprint=digest(canonical), responseBytes=response_limit)
        if grant.get("reused"):
            if grant.get("state") != "completed" or not grant.get("resultRef"):
                raise BrokerConflict("Operation is pending or its result is unavailable. It will not execute twice.")
            result = self.results.read(grant["resultRef"], response_limit)
            # Serving a retry spends transfer quota again, without repeating Blender code.
            delivery_id = uuid.uuid4().hex
            self.ledger.call("authorizeOperation", reservationId=reservation_id, launchGeneration=row["launchGeneration"],
                             operationId=delivery_id, payloadFingerprint=digest(f"delivery:{operation_key}"), responseBytes=response_limit)
            count = len(json.dumps(result, separators=(",", ":"), allow_nan=False).encode())
            self.ledger.call("completeOperation", operationId=delivery_id, actualResponseBytes=count, state="completed")
            return result
        # Keep uncertain operations claimed. A crash or timeout must never re-execute arbitrary code.
        result = self.provider.call(row["providerWorkerId"], request, max_bytes=response_limit, timeout=TOOL_TIMEOUT_SECONDS)
        reference, count = self.results.write(reservation_id, operation_key, result, response_limit)
        self.ledger.call("completeOperation", operationId=operation_key, actualResponseBytes=count, state="completed", resultRef=reference)
        return result

    def download(self, token: str, reservation_id: str, name: str, response_limit: int = DEFAULT_RESPONSE_BYTES) -> bytes:
        row = self.owned(token, reservation_id)
        if row["status"] != "running" or row.get("stopRequested"):
            raise BrokerConflict("Download exports while the session is running.")
        if type(response_limit) is not int or not 1 <= response_limit <= MAX_RESPONSE_BYTES:
            raise ValueError("Invalid response limit.")
        operation_id = uuid.uuid4().hex
        self.ledger.call("authorizeOperation", reservationId=reservation_id, launchGeneration=row["launchGeneration"], operationId=operation_id, payloadFingerprint=digest(f"download:{name}"), responseBytes=response_limit)
        sink = io.BytesIO()
        try:
            self.provider.read_artifact(row["providerWorkerId"], name, sink, max_bytes=response_limit)
        except Exception:
            # File reads do not execute Blender code. Conservatively account for
            # the transfer without leaving a claim that would prevent a checkpoint.
            self.ledger.call("completeOperation", operationId=operation_id, actualResponseBytes=response_limit, state="failed", error="Artifact transfer did not complete.")
            raise
        payload = sink.getvalue()
        self.ledger.call("completeOperation", operationId=operation_id, actualResponseBytes=len(payload), state="completed")
        return payload
