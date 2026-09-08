"""Operator deployment of the trusted broker; workers use a separate prebuilt image."""
from __future__ import annotations

import os
import time
import uuid
from pathlib import Path

import modal

APP_NAME = "agartha-paid-blender"
app = modal.App(APP_NAME)
source = Path(__file__).resolve().parents[2] / "cloud"
image = (modal.Image.debian_slim(python_version="3.12")
         .pip_install("modal==1.5.3", "mcp==1.26.0", "starlette==1.6.0", "httpx==0.28.1")
         .add_local_dir(source / "blender_billing", "/opt/agartha/cloud/blender_billing", copy=True,
                        ignore=lambda path: path.name.startswith("test_") or "__pycache__" in path.parts)
         .add_local_dir(source / "blender_mcp", "/opt/agartha/cloud/blender_mcp", copy=True,
                        ignore=lambda path: path.name.startswith("test_") or "__pycache__" in path.parts)
         .env({"PYTHONPATH": "/opt/agartha"}))
storage = modal.Volume.from_name("agartha-paid-blender-private", create_if_missing=True, version=2)
secrets = [modal.Secret.from_name("agartha-paid-blender-broker")]


def controller():
    from .broker import Broker, ResultStore
    from .ledger import LedgerClient
    from .projects import ProjectStore
    from .provider import ModalProvider
    from .durable_storage import StorageCoordinator
    ledger = LedgerClient(os.environ["AGARTHA_CONVEX_SITE_URL"], os.environ["AGARTHA_BILLING_GATEWAY_KEY"], os.environ["AGARTHA_BILLING_BROKER_KEY"])
    provider = ModalProvider(modal, os.environ["AGARTHA_PAID_BLENDER_IMAGE_ID"], APP_NAME)
    coordinator = StorageCoordinator(storage.reload)
    projects = ProjectStore(Path("/private/projects"), ledger, provider, storage.commit, coordinator)
    return Broker(ledger, provider, ResultStore(Path("/private/results"), storage.commit, coordinator), projects)


@app.function(image=image, secrets=secrets, volumes={"/private": storage}, cpu=(0.125, 0.5), memory=(256, 512), timeout=2100, max_containers=4)
def monitor_session(reservation_id: str):
    broker = controller()
    executor = uuid.uuid4().hex
    while broker.ledger.call("claimMonitor", reservationId=reservation_id, executorId=executor).get("claimed"):
        try:
            row = broker.reconcile(reservation_id)
            if row["status"] in {"settled", "failed"}:
                return
        except Exception:
            # Keep uncertain holds. No unverified failure releases customer money.
            pass
        time.sleep(10)


@app.function(image=image, secrets=secrets, volumes={"/private": storage}, cpu=(0.125, 1), memory=(512, 4096), timeout=180, max_containers=1, scaledown_window=60)
@modal.concurrent(max_inputs=4)
@modal.asgi_app()
def serve():
    from .http import create_http_app
    return create_http_app(controller(), lambda reservation_id: monitor_session.spawn(reservation_id))


@app.function(image=image, secrets=secrets, cpu=(0.125, 0.25), memory=256, timeout=60, schedule=modal.Period(seconds=60))
def reconcile_sessions():
    broker = controller()
    for row in broker.ledger.call("listActiveReservations"):
        monitor_session.spawn(row["reservationId"])


@app.function(image=image, secrets=secrets, volumes={"/private": storage}, cpu=(0.125, 0.25), memory=256, timeout=300, schedule=modal.Period(hours=1))
def expire_projects():
    broker = controller()
    broker.projects.recover()
    cursor = None
    for _ in range(100):
        page = broker.ledger.call("listExpiredProjects", **({"cursor": cursor} if cursor else {}))
        for project in page["page"]:
            broker.projects.collect(project["projectId"])
        if page["isDone"]:
            return
        cursor = page["cursor"]
