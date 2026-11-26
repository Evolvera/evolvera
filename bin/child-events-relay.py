#!/usr/bin/env python3
import ctypes
import errno
import fcntl
import json
import os
import re
import select
import signal
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

RUN_ID = re.compile(r"run_[A-Za-z0-9_-]+")
TERM_ID = re.compile(r"term_[A-Za-z0-9_-]+")
EVENT_KINDS = {"idle", "prompt", "quit", "killed", "died", "job", "goal_finished", "goal_blocked",
               "goal_paused", "goal_usage_limited"}
CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f-\x9f]")
MAX_TEXT = 1600
MAX_NOTICE = 3500


@dataclass(frozen=True)
class Timing:
    coalesce: float = 4.0
    retry_initial: float = 10.0
    retry_max: float = 300.0
    screen_timeout: float = 20.0
    send_timeout: float = 40.0


def process_start_time(pid):
    try:
        stat = Path(f"/proc/{pid}/stat").read_text()
        fields = stat[stat.rfind(") ") + 2:].split()
        return fields[19]
    except (OSError, IndexError, ValueError):
        return None


def identity_matches(pid, start_time):
    return isinstance(start_time, str) and process_start_time(pid) == start_time


def write_json_atomic(path, value):
    path = Path(path)
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    with tmp.open("x", encoding="utf-8") as stream:
        json.dump(value, stream, ensure_ascii=True, separators=(",", ":"))
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(tmp, path)


class Relay:
    def __init__(self, agent_dir, timing=Timing()):
        self.agent_dir = Path(agent_dir)
        self.root = self.agent_dir / "child-events"
        self.queue = self.root / "queue"
        self.children = self.root / "children"
        self.routes_path = self.agent_dir / "report-routes.json"
        self.marker = self.root / "relay.pid.json"
        self.timing = timing
        self.pidfds = {}
        self.backoff = {}
        self.first_seen = {}
        self.libc = ctypes.CDLL("libc.so.6", use_errno=True)
        self.inotify_fd = self.libc.inotify_init1(os.O_NONBLOCK | os.O_CLOEXEC)
        if self.inotify_fd < 0:
            raise OSError(ctypes.get_errno(), "inotify_init1 failed")
        self.poller = select.poll()
        self.poller.register(self.inotify_fd, select.POLLIN)
        self.lock_stream = None

    def prepare(self):
        self.root.mkdir(parents=True, exist_ok=True)
        self.queue.mkdir(exist_ok=True)
        self.children.mkdir(exist_ok=True)
        lock_path = self.root / "relay.lock"
        self.lock_stream = lock_path.open("a+")
        try:
            fcntl.flock(self.lock_stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return False
        self.add_watch(self.queue)
        self.add_watch(self.children)
        self.add_watch(self.agent_dir)
        self.rescan_children()
        self.process_start = process_start_time(os.getpid())
        if self.process_start is None:
            raise RuntimeError("cannot read relay process identity")
        write_json_atomic(self.marker, {"pid": os.getpid(), "startTime": self.process_start})
        return True

    def add_watch(self, path):
        mask = 0x00000008 | 0x00000080 | 0x00000100 | 0x00000400 | 0x00000800 | 0x00000200
        wd = self.libc.inotify_add_watch(self.inotify_fd, os.fsencode(path), mask)
        if wd < 0:
            raise OSError(ctypes.get_errno(), f"inotify_add_watch failed for {path}")

    def enqueue(self, info, kind, text):
        event_id = (f"died-{info['pid']}-{info['startTime']}" if kind == "died" else
                    f"{time.time_ns()}-{os.getpid()}-{info['pid']}")
        event = {"id": event_id, "pid": info["pid"], "ts": time.time(), "runId": info["runId"],
                 "cwd": info["cwd"], "child": info["child"], "kind": kind, "text": text[:MAX_TEXT]}
        write_json_atomic(self.queue / f"{event_id}.json", event)

    def valid_child(self, value, filename):
        if not isinstance(value, dict) or set(value) != {"pid", "startTime", "runId", "cwd", "child", "clean"}:
            return False
        pid = value["pid"]
        return (isinstance(pid, int) and pid > 0 and filename == f"{pid}.json" and
                isinstance(value["startTime"], str) and bool(value["startTime"]) and
                isinstance(value["runId"], str) and RUN_ID.fullmatch(value["runId"]) and
                all(isinstance(value[k], str) for k in ("cwd", "child")) and
                isinstance(value["clean"], bool))

    def rescan_children(self):
        for path in sorted(self.children.glob("*.json")):
            try:
                info = json.loads(path.read_text(encoding="utf-8"))
                if not self.valid_child(info, path.name):
                    path.unlink(missing_ok=True)
                    continue
                identity = (info["pid"], info["startTime"])
                if info["clean"]:
                    path.unlink(missing_ok=True)
                    continue
                if identity in self.pidfds.values():
                    continue
                if not identity_matches(*identity):
                    self.enqueue(info, "died", "O processo filho terminou sem recibo limpo.")
                    path.unlink(missing_ok=True)
                    continue
                if not hasattr(os, "pidfd_open"):
                    continue
                try:
                    fd = os.pidfd_open(info["pid"], 0)
                except OSError:
                    continue
                if not identity_matches(*identity):
                    os.close(fd)
                    continue
                self.pidfds[fd] = identity
                self.poller.register(fd, select.POLLIN)
            except (OSError, ValueError, TypeError, json.JSONDecodeError):
                path.unlink(missing_ok=True)

    def child_path(self, pid):
        return self.children / f"{pid}.json"

    def on_exit(self, fd):
        pid, start_time = self.pidfds.pop(fd)
        self.poller.unregister(fd)
        os.close(fd)
        path = self.child_path(pid)
        try:
            info = json.loads(path.read_text(encoding="utf-8"))
            if (self.valid_child(info, path.name) and info["startTime"] == start_time and
                    not info["clean"]):
                self.enqueue(info, "died", "O processo filho terminou sem recibo limpo.")
            if self.valid_child(info, path.name) and info["startTime"] == start_time:
                path.unlink(missing_ok=True)
        except (OSError, ValueError, TypeError, json.JSONDecodeError):
            pass

    def routes(self):
        try:
            value = json.loads(self.routes_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}
        if not isinstance(value, dict):
            return {}
        return {run: term for run, term in value.items()
                if isinstance(run, str) and RUN_ID.fullmatch(run) and isinstance(term, str) and TERM_ID.fullmatch(term)}

    def screen_is_safe(self, terminal):
        try:
            result = subprocess.run(["orca-ide", "terminal", "read", "--terminal", terminal,
                                     "--screen", "--json"], capture_output=True, text=True,
                                    timeout=self.timing.screen_timeout, check=False)
            payload = json.loads(result.stdout)
            terminal_info = payload["result"]["terminal"]
            tail = terminal_info["tail"]
            if (result.returncode != 0 or terminal_info.get("handle") != terminal or
                    not isinstance(tail, list) or not tail or
                    not all(isinstance(line, str) for line in tail) or
                    terminal_info.get("status") == "exited" or
                    terminal_info.get("source") not in (None, "screen")):
                return False, False
            screen = "\n".join(tail)
            return "enter select" not in screen.casefold(), True
        except (OSError, subprocess.TimeoutExpired, ValueError, KeyError, TypeError):
            return False, False

    @staticmethod
    def safe_notice(events):
        lines = []
        for event in events:
            text = " ".join(CONTROL_CHARS.sub(" ", event["text"]).split())[:MAX_TEXT]
            child = " ".join(CONTROL_CHARS.sub(" ", event["child"]).split())[:100]
            if event["kind"].startswith("goal_") and text.startswith("[child "):
                lines.append(text)
            else:
                lines.append(f"[child {child}] {event['kind']}: {text}")
        message = "AVISO DE FILHOS: " + " || ".join(lines)
        return message if len(message) <= MAX_NOTICE else None

    def send(self, terminal, events):
        message = self.safe_notice(events)
        if message is None:
            return False
        try:
            result = subprocess.run(["orca-ide", "terminal", "send", "--terminal", terminal,
                                     "--text", message, "--enter", "--wait-submit", "8", "--json"],
                                    capture_output=True, text=True, timeout=self.timing.send_timeout,
                                    check=False)
            receipt = json.loads(result.stdout)
            return result.returncode == 0 and isinstance(receipt, dict) and receipt.get("ok") is True
        except (OSError, subprocess.TimeoutExpired, ValueError, TypeError):
            return False

    def queue_events(self):
        events = []
        for path in sorted(self.queue.glob("*.json")):
            try:
                value = json.loads(path.read_text(encoding="utf-8"))
                if not self.valid_event(value):
                    path.unlink(missing_ok=True)
                    continue
                events.append((path, value))
            except (OSError, ValueError, TypeError):
                try:
                    path.unlink(missing_ok=True)
                except OSError:
                    pass
        return events

    @staticmethod
    def valid_event(value):
        return (isinstance(value, dict) and set(value) == {"id", "pid", "ts", "runId", "cwd", "child", "kind", "text"} and
                isinstance(value["id"], str) and isinstance(value["pid"], int) and
                isinstance(value["ts"], (str, int, float)) and isinstance(value["runId"], str) and
                RUN_ID.fullmatch(value["runId"]) is not None and
                all(isinstance(value[k], str) for k in ("cwd", "child", "text")) and
                isinstance(value["kind"], str) and value["kind"] in EVENT_KINDS)

    def deliver(self, now):
        queued = self.queue_events()
        if not queued:
            self.first_seen.clear()
            return None
        routes = self.routes()
        grouped = {}
        for path, event in queued:
            terminal = routes.get(event["runId"])
            if terminal is None:
                continue
            grouped.setdefault(terminal, []).append((path, event))
        next_wake = None
        for terminal, items in grouped.items():
            first = min(self.first_seen.setdefault(str(path), now) for path, _ in items)
            if now - first < self.timing.coalesce:
                delay = self.timing.coalesce - (now - first)
                next_wake = delay if next_wake is None else min(next_wake, delay)
                continue
            retry_at, retry_delay = self.backoff.get(terminal, (0.0, 0.0))
            if now < retry_at:
                next_wake = retry_at - now if next_wake is None else min(next_wake, retry_at - now)
                continue
            batches = []
            batch = []
            for item in items:
                candidate = [event for _, event in batch] + [item[1]]
                if batch and self.safe_notice(candidate) is None:
                    batches.append(batch)
                    batch = [item]
                else:
                    batch.append(item)
            if batch:
                batches.append(batch)
            sent_all = True
            for group in batches:
                allowed, _ = self.screen_is_safe(terminal)
                if not allowed or not self.send(terminal, [event for _, event in group]):
                    sent_all = False
                    break
                for path, _ in group:
                    path.unlink(missing_ok=True)
                    self.first_seen.pop(str(path), None)
            if sent_all:
                self.backoff.pop(terminal, None)
                continue
            delay = min(self.timing.retry_max, max(self.timing.retry_initial, retry_delay * 2))
            self.backoff[terminal] = (now + delay, delay)
            next_wake = delay if next_wake is None else min(next_wake, delay)
        return next_wake

    def run(self):
        if not self.prepare():
            return 0
        def stop(_signal, _frame):
            raise SystemExit(0)

        for sig in (signal.SIGTERM, signal.SIGINT):
            signal.signal(sig, stop)
        try:
            while True:
                self.rescan_children()
                wait = self.deliver(time.monotonic())
                timeout_ms = -1 if wait is None else max(1, int(wait * 1000))
                for fd, _ in self.poller.poll(timeout_ms):
                    if fd == self.inotify_fd:
                        try:
                            os.read(fd, 65536)
                        except BlockingIOError:
                            pass
                        self.rescan_children()
                    elif fd in self.pidfds:
                        self.on_exit(fd)
        finally:
            for fd in list(self.pidfds):
                try:
                    self.poller.unregister(fd)
                    os.close(fd)
                except OSError:
                    pass
            try:
                marker = json.loads(self.marker.read_text(encoding="utf-8"))
                if marker == {"pid": os.getpid(), "startTime": self.process_start}:
                    self.marker.unlink(missing_ok=True)
            except (OSError, ValueError):
                pass
            os.close(self.inotify_fd)
            if self.lock_stream:
                self.lock_stream.close()
        return 0


def run(agent_dir=None, timing=Timing()):
    if sys.platform != "linux":
        print("child-events relay requires Linux", file=sys.stderr)
        return 0
    resolved_agent_dir = agent_dir or os.environ.get("PI_CODING_AGENT_DIR") or str(Path.home() / ".pi" / "agent")
    try:
        return Relay(resolved_agent_dir, timing).run()
    except OSError as error:
        if error.errno in (errno.ENOSYS, errno.ENOTSUP):
            print("child-events relay requires Linux inotify and pidfd support", file=sys.stderr)
            return 1
        print(f"child-events relay: {error.__class__.__name__}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(run())
