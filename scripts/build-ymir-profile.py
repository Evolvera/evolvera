#!/usr/bin/env python3
"""Build a deterministic, authenticated Ymir PI profile from an exact Git commit."""

from __future__ import annotations

import argparse
import dataclasses
import gzip
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
import tarfile
import tempfile
from typing import Iterable, Mapping, Sequence

PI_VERSION = "0.83.0"
ARCHIVE_NAME = "ymir-profile.tar.gz"
MANIFEST_NAME = "ymir-profile.manifest.json"
CHECKSUM_NAME = "ymir-profile.sha256"
EXPECTED_AGENT_COUNT = 32
EXPECTED_SKILL_COUNT = 26
EXPECTED_EXTENSION_COUNT = 11
EXPECTED_THEME_COUNT = 1

TOP_LEVEL_FILES = {
    "config/SYSTEM.md": "agent/SYSTEM.md",
    "config/models.json": "agent/models.json",
    "config/pi-goal.json": "agent/pi-goal.json",
    "config/settings.json": "agent/settings.json",
    "config/mcp.json": "agent/mcp.json",
    "subagents.json": "agent/subagents.json",
}

_SECRET_PATTERNS: tuple[tuple[str, re.Pattern[bytes]], ...] = (
    ("private-key", re.compile(rb"-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----")),
    ("cloud-access-key", re.compile(rb"\bAKIA[0-9A-Z]{16}\b")),
    ("github-token", re.compile(rb"\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b")),
    ("slack-token", re.compile(rb"\bxox[baprs]-[A-Za-z0-9-]{16,}\b")),
    ("api-token", re.compile(rb"\b(?:sk|rk)-[A-Za-z0-9]{20,}\b")),
    (
        "credential-assignment",
        re.compile(
            rb"(?i)\b(?:password|secret|token|api[_-]?key)\s*[:=]\s*['\"]"
            rb"(?![<$\{][^'\"]*[>$\}])[^'\"]{12,}['\"]"
        ),
    ),
)
_PERSONAL_PATH_PATTERNS: tuple[tuple[str, re.Pattern[bytes]], ...] = (
    ("absolute-user-path", re.compile(rb"(?:^|[\s'\"`=(])/(?:Users|home)/[^\s'\"`)]+")),
    ("windows-user-path", re.compile(rb"(?i)(?:^|[\s'\"`=(])[A-Z]:[\\/]Users[\\/][^\s'\"`)]+")),
)


class BundleError(Exception):
    """A safe, user-facing build failure without secret content."""


@dataclasses.dataclass(frozen=True)
class TreeEntry:
    path: str
    mode: str
    kind: str
    object_id: str

    @property
    def output_mode(self) -> str:
        return "0755" if self.mode == "100755" else "0644"


def _run_git(repo: Path, args: Sequence[str], *, input_bytes: bytes | None = None) -> bytes:
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=repo,
            input=input_bytes,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
        )
    except (OSError, subprocess.CalledProcessError) as exc:
        detail = "git command failed"
        if isinstance(exc, subprocess.CalledProcessError) and exc.stderr:
            detail = "git command failed"
        raise BundleError(detail) from exc
    return result.stdout


def _validate_source_sha(source_sha: str) -> None:
    if not re.fullmatch(r"[0-9a-f]{40}", source_sha):
        raise BundleError("source-sha must be exactly 40 lowercase hexadecimal characters")


def _validate_path(path: str, *, category: str = "unsafe-path") -> None:
    if not path or "\\" in path or any(ord(char) < 0x20 or ord(char) == 0x7F for char in path):
        raise BundleError(f"unsafe input: {path or '<empty>'} ({category})")
    pure = PurePosixPath(path)
    if pure.is_absolute() or any(part in {"", ".", ".."} for part in path.split("/")):
        raise BundleError(f"unsafe input: {path} ({category})")


def read_tree(repo: Path, source_sha: str) -> dict[str, TreeEntry]:
    """Read only the named commit's tree; the working tree is never consulted."""
    _validate_source_sha(source_sha)
    resolved = _run_git(repo, ["rev-parse", "--verify", f"{source_sha}^{{commit}}"]).decode().strip()
    if resolved != source_sha:
        raise BundleError("source-sha does not identify the exact requested commit")

    raw = _run_git(repo, ["ls-tree", "-r", "-z", "--full-tree", source_sha])
    entries: dict[str, TreeEntry] = {}
    for record in raw.split(b"\0"):
        if not record:
            continue
        try:
            header, raw_path = record.split(b"\t", 1)
            mode, kind, object_id = header.decode("ascii").split(" ")
            path = raw_path.decode("utf-8")
        except (UnicodeDecodeError, ValueError) as exc:
            raise BundleError("invalid Git tree entry (malformed-path)") from exc
        _validate_path(path)
        if path in entries:
            raise BundleError(f"unsafe input: {path} (duplicate-path)")
        entries[path] = TreeEntry(path, mode, kind, object_id)
    return entries


def _is_selected_source_path(path: str, skill_roots: set[str]) -> bool:
    if path in TOP_LEVEL_FILES:
        return True
    if path.startswith("agents/") and path.count("/") == 1 and path.endswith(".md"):
        return True
    if path.startswith("skills/"):
        parts = path.split("/")
        return len(parts) >= 3 and parts[1] in skill_roots
    if path.startswith("themes/") and path.count("/") == 1 and path.endswith(".json"):
        return True
    if path.startswith("extensions/") and path.count("/") == 1 and path.endswith(".ts"):
        return Path(path).name != "project-memory.ts"
    return False


def _output_path(source_path: str) -> str:
    if source_path in TOP_LEVEL_FILES:
        return TOP_LEVEL_FILES[source_path]
    if source_path.startswith("agents/"):
        return "agent/" + source_path
    if source_path.startswith("skills/"):
        return "agent/" + source_path
    if source_path.startswith("themes/"):
        return "agent/" + source_path
    if source_path.startswith("extensions/"):
        return "agent/" + source_path
    raise BundleError(f"unapproved input root: {source_path} (unapproved-root)")


def _read_blob(repo: Path, source_sha: str, source_path: str) -> bytes:
    return _run_git(repo, ["cat-file", "blob", f"{source_sha}:{source_path}"])


def _validate_bytes(source_path: str, data: bytes) -> None:
    for category, pattern in _SECRET_PATTERNS:
        if pattern.search(data):
            raise BundleError(f"unsafe input: {source_path} ({category})")
    for category, pattern in _PERSONAL_PATH_PATTERNS:
        if pattern.search(data):
            raise BundleError(f"unsafe input: {source_path} ({category})")
    if source_path.endswith(".json"):
        try:
            json.loads(data.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise BundleError(f"unsafe input: {source_path} (invalid-json)") from exc


def _local_reference_paths(source_path: str, data: bytes) -> Iterable[str]:
    if not source_path.endswith(".md"):
        return ()
    text = data.decode("utf-8", errors="strict")
    found: list[str] = []
    for match in re.finditer(r"!?(?:\[[^\]]*\])\(([^)]+)\)", text):
        target = match.group(1).strip()
        if target.startswith("<") and ">" in target:
            target = target[1 : target.index(">")]
        target = target.split(None, 1)[0] if target else ""
        if not target or target.startswith("#"):
            continue
        if re.match(r"(?i)^(?:[a-z][a-z0-9+.-]*:|//)", target):
            continue
        target = target.split("#", 1)[0].split("?", 1)[0]
        if not target or target.startswith("/"):
            continue
        if target.startswith(("agents/", "skills/", "config/", "extensions/", "themes/")):
            candidate = target
        else:
            candidate = str(PurePosixPath(source_path).parent.joinpath(target))
        found.append(candidate)
    return found


def _validate_local_references(contents: Mapping[str, bytes]) -> None:
    source_paths = set(contents)
    for source_path, data in contents.items():
        try:
            references = _local_reference_paths(source_path, data)
        except UnicodeDecodeError as exc:
            raise BundleError(f"unsafe input: {source_path} (invalid-utf8)") from exc
        for reference in references:
            try:
                _validate_path(reference, category="local-reference")
            except BundleError as exc:
                raise BundleError(f"unsafe input: {source_path} (local-reference)") from exc
            if reference not in source_paths:
                raise BundleError(f"unsafe input: {source_path} (missing-local-reference)")


def collect_files(repo: Path, source_sha: str) -> tuple[dict[str, tuple[bytes, str]], dict[str, int]]:
    """Return output-path -> (bytes, mode), plus the canonical inventory counts."""
    entries = read_tree(repo, source_sha)
    skill_roots = {
        path.split("/")[1]
        for path in entries
        if path.startswith("skills/") and len(path.split("/")) >= 2
    }
    selected_source_paths = [
        path for path in entries if _is_selected_source_path(path, skill_roots)
    ]

    agents = [path for path in selected_source_paths if path.startswith("agents/")]
    skills = [path for path in selected_source_paths if path.startswith("skills/")]
    extensions = [path for path in selected_source_paths if path.startswith("extensions/")]
    themes = [path for path in selected_source_paths if path.startswith("themes/")]
    if len(agents) != EXPECTED_AGENT_COUNT:
        raise BundleError(f"canonical inventory mismatch: agents ({len(agents)})")
    if len(skill_roots) != EXPECTED_SKILL_COUNT:
        raise BundleError(f"canonical inventory mismatch: skill-roots ({len(skill_roots)})")
    if len(extensions) != EXPECTED_EXTENSION_COUNT:
        raise BundleError(f"canonical inventory mismatch: extensions ({len(extensions)})")
    if len(themes) != EXPECTED_THEME_COUNT:
        raise BundleError(f"canonical inventory mismatch: themes ({len(themes)})")
    for root in sorted(skill_roots):
        if f"skills/{root}/SKILL.md" not in entries:
            raise BundleError(f"missing input: skills/{root}/SKILL.md (missing-skill-manifest)")

    output: dict[str, tuple[bytes, str]] = {}
    source_contents: dict[str, bytes] = {}
    for source_path in sorted(selected_source_paths):
        entry = entries[source_path]
        if entry.kind != "blob":
            raise BundleError(f"unsafe input: {source_path} (special-file)")
        if entry.mode == "120000":
            raise BundleError(f"unsafe input: {source_path} (link)")
        if entry.mode not in {"100644", "100755"}:
            raise BundleError(f"unsafe input: {source_path} (special-permissions)")
        data = _read_blob(repo, source_sha, source_path)
        _validate_bytes(source_path, data)
        source_contents[source_path] = data
        destination = _output_path(source_path)
        _validate_path(destination)
        if destination in output:
            raise BundleError(f"unsafe input: {destination} (duplicate-output-path)")
        output[destination] = (data, entry.output_mode)

    required_top_level = set(TOP_LEVEL_FILES)
    if not required_top_level.issubset(source_contents):
        missing = sorted(required_top_level - set(source_contents))[0]
        raise BundleError(f"missing input: {missing} (required-top-level-file)")
    _validate_local_references(source_contents)
    counts = {
        "agents": len(agents),
        "skill_roots": len(skill_roots),
        "extensions": len(extensions),
        "themes": len(themes),
        "top_level": len(TOP_LEVEL_FILES),
    }
    return dict(sorted(output.items())), counts


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _manifest(source_sha: str, archive_bytes: bytes, files: Mapping[str, tuple[bytes, str]]) -> bytes:
    payload = {
        "format": 1,
        "source_sha": source_sha,
        "pi_version": PI_VERSION,
        "archive": {"name": ARCHIVE_NAME, "sha256": _sha256(archive_bytes)},
        "files": {
            name: {"sha256": _sha256(data), "mode": mode}
            for name, (data, mode) in sorted(files.items())
        },
    }
    return (json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")


def _archive(files: Mapping[str, tuple[bytes, str]]) -> bytes:
    result = tempfile.SpooledTemporaryFile(max_size=4 * 1024 * 1024, mode="w+b")
    with gzip.GzipFile(filename="", mode="wb", fileobj=result, mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode="w", format=tarfile.USTAR_FORMAT) as archive:
            for name, (data, mode) in sorted(files.items()):
                info = tarfile.TarInfo(name=name)
                info.size = len(data)
                info.mode = int(mode, 8)
                info.uid = 0
                info.gid = 0
                info.uname = ""
                info.gname = ""
                info.mtime = 0
                info.type = tarfile.REGTYPE
                archive.addfile(info, io.BytesIO(data))
    result.seek(0)
    data = result.read()
    result.close()
    return data


def build_bundle(source_sha: str, output_dir: Path, *, repo: Path | None = None) -> dict[str, object]:
    repo = (repo or Path(__file__).resolve().parents[1]).resolve()
    output_dir = Path(output_dir).resolve()
    if output_dir == repo or repo in output_dir.parents:
        raise BundleError("output directory must not be inside the source repository")
    output_dir.mkdir(parents=True, exist_ok=True)
    if any(output_dir.iterdir()):
        raise BundleError("output directory must be empty and run-owned")

    files, counts = collect_files(repo, source_sha)
    archive_bytes = _archive(files)
    manifest_bytes = _manifest(source_sha, archive_bytes, files)
    checksum_bytes = (
        f"{_sha256(archive_bytes)}  {ARCHIVE_NAME}\n"
        f"{_sha256(manifest_bytes)}  {MANIFEST_NAME}\n"
    ).encode("ascii")

    for name, data in (
        (ARCHIVE_NAME, archive_bytes),
        (MANIFEST_NAME, manifest_bytes),
        (CHECKSUM_NAME, checksum_bytes),
    ):
        destination = output_dir / name
        with tempfile.NamedTemporaryFile(dir=output_dir, prefix=f".{name}.", delete=False) as temp:
            temp.write(data)
            temp.flush()
            os.fsync(temp.fileno())
            temporary = Path(temp.name)
        os.replace(temporary, destination)
    return {"source_sha": source_sha, "counts": counts, "files": len(files)}


def _parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-sha", required=True, help="exact 40-character lowercase Git commit SHA")
    parser.add_argument("--output-dir", required=True, type=Path, help="empty run-owned output directory")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    try:
        args = _parse_args(argv or sys.argv[1:])
        result = build_bundle(args.source_sha, args.output_dir)
    except BundleError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    print(
        f"Built {ARCHIVE_NAME}, {MANIFEST_NAME}, and {CHECKSUM_NAME} "
        f"from {result['source_sha']} ({result['files']} files)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
