from __future__ import annotations

from fastapi import Request


class TraceContext:
    """Trace context extracted from request headers."""

    call_id: str = "no-call"
    user_id: str = "anon"

    @classmethod
    def from_request(cls, req: Request) -> TraceContext:
        ctx = cls()
        ctx.call_id = req.headers.get("x-call-id", "no-call")
        ctx.user_id = req.headers.get("x-user-id", "anon")
        return ctx

    @property
    def _prefix(self) -> str:
        return f"[{self.call_id}] [{self.user_id}]"

    def log_info(self, msg: str, *args: object) -> None:
        print(f"{self._prefix} INFO {msg % args}" if args else f"{self._prefix} INFO {msg}")

    def log_error(self, msg: str, *args: object) -> None:
        print(f"{self._prefix} ERROR {msg % args}" if args else f"{self._prefix} ERROR {msg}")

    def log_warn(self, msg: str, *args: object) -> None:
        print(f"{self._prefix} WARN {msg % args}" if args else f"{self._prefix} WARN {msg}")


default_ctx = TraceContext()
