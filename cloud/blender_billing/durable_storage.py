"""Serialize local Volume file access and refresh cross-container commits."""
from contextlib import contextmanager
from functools import wraps
import threading


class StorageCoordinator:
    def __init__(self, refresh=lambda: None):
        self.refresh = refresh
        self.lock = threading.RLock()
        self.local = threading.local()

    @contextmanager
    def transaction(self):
        with self.lock:
            depth = getattr(self.local, 'depth', 0)
            if depth == 0:
                self.refresh()
            self.local.depth = depth + 1
            try:
                yield
            finally:
                self.local.depth = depth


def storage_transaction(method):
    @wraps(method)
    def wrapped(self, *args, **kwargs):
        with self.storage.transaction():
            return method(self, *args, **kwargs)
    return wrapped
