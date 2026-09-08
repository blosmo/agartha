"""Durable checkpoint transactions on storage unavailable to Blender workers."""
from __future__ import annotations

import hashlib
import json
import os
import re
import uuid
from pathlib import Path
from typing import Any, Callable

from .ledger import LedgerClient
from .provider import ModalProvider
from .storage import PROJECT_MAX_BYTES
from .durable_storage import StorageCoordinator, storage_transaction


class ProjectStore:
    def __init__(self, root: Path, ledger: LedgerClient, provider: ModalProvider,
                 flush: Callable[[], None] = lambda: None, storage: StorageCoordinator | None = None) -> None:
        self.root = root
        self.ledger = ledger
        self.provider = provider
        self.flush = flush
        self.storage = storage or StorageCoordinator()

    def _path(self, reference: str) -> Path:
        if not re.fullmatch(r"[a-f0-9]{64}/[a-f0-9]{32}\.blend", reference):
            raise ValueError("Invalid private checkpoint reference.")
        return self.root / reference

    def _metadata(self, row: dict[str, Any]) -> dict[str, Any]:
        return self.ledger.call("getProjectForReservation", sessionId=row["reservationId"], sessionGeneration=row["launchGeneration"], projectId=row["projectId"])

    def activate(self, row: dict[str, Any]) -> None:
        self.ledger.call("ensureProjectForReservation", sessionId=row["reservationId"], sessionGeneration=row["launchGeneration"])

    @storage_transaction
    def restore(self, row: dict[str, Any], worker_id: str) -> None:
        self.activate(row)
        metadata = self._metadata(row)
        version = metadata.get("version")
        if not version:
            return
        path = self._path(version["blobRef"])
        count = 0
        sha = hashlib.sha256()
        with path.open("rb") as source:
            while chunk := source.read(min(1_048_576, PROJECT_MAX_BYTES - count + 1)):
                count += len(chunk)
                if count > PROJECT_MAX_BYTES:
                    raise ValueError("Stored checkpoint exceeds project limit.")
                sha.update(chunk)
            if count != version["bytes"] or sha.hexdigest() != version["sha256"]:
                raise ValueError("Stored checkpoint failed integrity verification.")
            source.seek(0)
            self.provider.write_checkpoint(worker_id, source, max_bytes=count)

    def _journal(self, path: Path, value: dict[str, Any]) -> None:
        temporary = path.with_suffix('.tmp')
        with temporary.open('w', encoding='utf-8') as handle:
            json.dump(value, handle, separators=(',', ':'), allow_nan=False)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        self.flush()

    @storage_transaction
    def checkpoint(self, row: dict[str, Any], worker_id: str, heartbeat: Callable[[], None] = lambda: None) -> None:
        heartbeat()
        self.activate(row)
        heartbeat()
        limit = PROJECT_MAX_BYTES
        operation_id = uuid.uuid4().hex
        owner = hashlib.sha256(f"{row['agentId']}:{row['livemode']}:{row['projectId']}".encode()).hexdigest()
        reference = f"{owner}/{operation_id}.blend"
        path = self._path(reference)
        path.parent.mkdir(parents=True, exist_ok=True)
        journal = path.with_suffix('.json')
        prepared = {"operationId": operation_id, "blobRef": reference, "state": "writing", "sessionId": row["reservationId"]}
        # Journal before reservation: startup recovery can safely attempt rollback even if no hold exists.
        self._journal(journal, prepared)
        self.ledger.call("reserveArtifactBytes", sessionId=row["reservationId"], sessionGeneration=row["launchGeneration"], operationId=operation_id, projectId=row["projectId"], maxBytes=limit, versionId=operation_id)
        heartbeat()
        try:
            saved = self.provider.call(worker_id, {"id": f"save-{operation_id}", "method": "tools/call", "params": {"name": "execute_blender_code", "arguments": {"code": "import bpy; bpy.ops.wm.save_as_mainfile(filepath='/workspace/project.blend')"}}}, max_bytes=65_536, timeout=10)
            result = saved.get("result", {})
            if result.get("isError") or not any(str(block.get("text", "")).startswith("Code executed successfully:") for block in result.get("content", []) if isinstance(block, dict)):
                raise RuntimeError("Blender could not save its editable project.")
            with path.open('xb') as target:
                count = self.provider.read_checkpoint(worker_id, target, max_bytes=limit)
                target.flush()
                os.fsync(target.fileno())
            heartbeat()
            sha = hashlib.sha256()
            with path.open('rb') as source:
                while chunk := source.read(1_048_576):
                    sha.update(chunk)
            prepared = {**prepared, "state": "prepared", "actualBytes": count, "sha256": sha.hexdigest()}
            self._journal(journal, prepared)
        except Exception:
            path.unlink(missing_ok=True)
            self.flush()
            self.ledger.call("rollbackArtifact", operationId=operation_id)
            journal.unlink(missing_ok=True)
            self.flush()
            raise
        # Do not delete this file on a commit timeout: the ledger may already reference it.
        heartbeat()
        self.ledger.call("commitArtifact", operationId=operation_id, actualBytes=prepared["actualBytes"], blobRef=reference, sha256=prepared["sha256"])
        journal.unlink(missing_ok=True)
        self.flush()

    @storage_transaction
    def recover(self) -> None:
        for index, journal in enumerate(self.root.glob('*/*.json')):
            if index >= 100:
                break
            try:
                data = json.loads(journal.read_text(encoding='utf-8'))
            except FileNotFoundError:
                continue
            path = self._path(data["blobRef"])
            grant = self.ledger.call("getArtifactReservation", operationId=data["operationId"])
            if grant and grant["status"] == "committed":
                journal.unlink(missing_ok=True)
                self.flush()
                continue
            if data["state"] == "prepared":
                if grant and grant["status"] == "held":
                    self.ledger.call("commitArtifact", operationId=data["operationId"], actualBytes=data["actualBytes"], blobRef=data["blobRef"], sha256=data["sha256"])
                elif grant and grant["status"] == "released":
                    path.unlink(missing_ok=True)
                else:
                    continue
            else:
                session = self.ledger.call("getReservationForBroker", reservationId=data["sessionId"])
                if session["status"] not in {"settled", "failed"}:
                    continue
                # Release the grant first. A delayed writer can no longer commit a deleted blob.
                if grant and grant["status"] == "held":
                    self.ledger.call("rollbackArtifact", operationId=data["operationId"])
                path.unlink(missing_ok=True)
                self.flush()
            journal.unlink(missing_ok=True)
            self.flush()

    @storage_transaction
    def collect(self, project_id: str) -> None:
        candidates = self.ledger.call("listArtifactDeletionCandidates", projectId=project_id, limit=100)
        for candidate in candidates:
            claim = self.ledger.call("claimArtifactDeletion", versionId=candidate["versionId"])
            self._path(claim["blobRef"]).unlink(missing_ok=True)
            self.flush()
            self.ledger.call("confirmArtifactDeletion", versionId=claim["versionId"], deletionToken=claim["deletionToken"])
