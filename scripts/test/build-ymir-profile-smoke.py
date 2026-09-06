#!/usr/bin/env python3
"""Focused offline tests for the deterministic Ymir profile producer."""

from __future__ import annotations

import gzip
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parents[2]
BUILDER_PATH = ROOT / "scripts" / "build-ymir-profile.py"
spec = importlib.util.spec_from_file_location("ymir_profile_builder", BUILDER_PATH)
assert spec and spec.loader
builder = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = builder
spec.loader.exec_module(builder)


def git(*args: str, cwd: Path = ROOT, env: dict[str, str] | None = None) -> str:
    return subprocess.check_output(["git", *args], cwd=cwd, text=True, env=env).strip()


def tracked_inputs() -> list[str]:
    names = set(builder.TOP_LEVEL_FILES)
    names.update(git("ls-files", "agents", "skills", "themes", "extensions").splitlines())
    return sorted(
        path
        for path in names
        if path in builder.TOP_LEVEL_FILES
        or path.startswith("agents/")
        or path.startswith("skills/")
        or path.startswith("themes/")
        or (path.startswith("extensions/") and "/" not in path[len("extensions/") :] and path.endswith(".ts"))
    )


def make_fixture(destination: Path, *, mutate: tuple[str, bytes] | None = None, symlink: str | None = None) -> str:
    destination.mkdir(parents=True)
    for relative in tracked_inputs():
        source = ROOT / relative
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    if mutate:
        target = destination / mutate[0]
        target.write_bytes(mutate[1])
    if symlink:
        target = destination / symlink
        target.unlink()
        target.symlink_to("SKILL.md")

    git("init", "-q", cwd=destination)
    git("add", ".", cwd=destination)
    env = {
        **os.environ,
        "GIT_AUTHOR_NAME": "smoke",
        "GIT_AUTHOR_EMAIL": "smoke@example.invalid",
        "GIT_COMMITTER_NAME": "smoke",
        "GIT_COMMITTER_EMAIL": "smoke@example.invalid",
    }
    git("commit", "-q", "-m", "fixture", cwd=destination, env=env)
    return git("rev-parse", "HEAD", cwd=destination)


def assert_bundle(output: Path, source_sha: str, fixture: Path) -> tuple[bytes, bytes, bytes]:
    archive_bytes = (output / builder.ARCHIVE_NAME).read_bytes()
    manifest_bytes = (output / builder.MANIFEST_NAME).read_bytes()
    checksum_bytes = (output / builder.CHECKSUM_NAME).read_bytes()
    assert archive_bytes[:10] == b"\x1f\x8b\x08\x00\x00\x00\x00\x00\x02\xff"
    assert checksum_bytes == (
        f"{hashlib.sha256(archive_bytes).hexdigest()}  {builder.ARCHIVE_NAME}\n"
        f"{hashlib.sha256(manifest_bytes).hexdigest()}  {builder.MANIFEST_NAME}\n"
    ).encode("ascii")
    manifest = json.loads(manifest_bytes)
    assert manifest_bytes == (json.dumps(manifest, sort_keys=True, separators=(",", ":")) + "\n").encode()
    assert manifest["format"] == 1
    assert manifest["source_sha"] == source_sha
    assert manifest["pi_version"] == builder.PI_VERSION
    assert manifest["archive"] == {
        "name": builder.ARCHIVE_NAME,
        "sha256": hashlib.sha256(archive_bytes).hexdigest(),
    }

    with gzip.GzipFile(fileobj=io.BytesIO(archive_bytes)) as compressed:
        with tarfile.open(fileobj=compressed, mode="r:") as archive:
            members = archive.getmembers()
            assert [member.name for member in members] == sorted(manifest["files"])
            assert all(member.name.startswith("agent/") for member in members)
            assert all(member.isfile() for member in members)
            assert all(member.uid == 0 and member.gid == 0 for member in members)
            assert all(member.uname == "" and member.gname == "" for member in members)
            assert all(member.mtime == 0 for member in members)
            assert all(member.mode in {0o644, 0o755} for member in members)
            assert manifest["files"]["agent/skills/design-catalog/scripts/setup-designs.sh"]["mode"] == "0755"
            assert manifest["files"]["agent/agents/agent-expert.md"]["mode"] == "0644"
            for member in members:
                data = archive.extractfile(member).read()
                assert hashlib.sha256(data).hexdigest() == manifest["files"][member.name]["sha256"]

    expected_execution_mode = subprocess.check_output(
        ["git", "show", f"{source_sha}:extensions/execution-mode.ts"], cwd=fixture
    )
    with gzip.GzipFile(fileobj=io.BytesIO(archive_bytes)) as compressed:
        with tarfile.open(fileobj=compressed, mode="r:") as archive:
            actual = archive.extractfile("agent/extensions/execution-mode.ts").read()
            assert actual == expected_execution_mode
    return archive_bytes, manifest_bytes, checksum_bytes


def assert_rejected(repo: Path, source_sha: str, category: str, leaked: bytes) -> None:
    with tempfile.TemporaryDirectory(prefix="ymir-reject-") as output_name:
        try:
            builder.build_bundle(source_sha, Path(output_name), repo=repo)
        except builder.BundleError as exc:
            message = str(exc)
            assert category in message, message
            assert leaked.decode("utf-8") not in message, message
        else:
            raise AssertionError(f"expected rejection: {category}")


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="ymir-profile-smoke-") as work_name:
        work = Path(work_name)
        fixture = work / "fixture"
        source_sha = make_fixture(fixture)
        cli_builder = fixture / "scripts" / "build-ymir-profile.py"
        cli_builder.parent.mkdir(parents=True)
        shutil.copy2(BUILDER_PATH, cli_builder)
        out_cli = work / "out-cli"
        cli_result = subprocess.run(
            [sys.executable, str(cli_builder), "--source-sha", source_sha, "--output-dir", str(out_cli)],
            cwd=fixture,
            text=True,
            capture_output=True,
        )
        assert cli_result.returncode == 0, cli_result.stderr
        out_a = work / "out-a"
        out_b = work / "out-b"
        result_a = builder.build_bundle(source_sha, out_a, repo=fixture)
        result_b = builder.build_bundle(source_sha, out_b, repo=fixture)
        assert result_a == result_b
        assert {path.name for path in out_a.iterdir()} == {
            builder.ARCHIVE_NAME,
            builder.MANIFEST_NAME,
            builder.CHECKSUM_NAME,
        }
        assert_bundle(out_a, source_sha, fixture)
        assert_bundle(out_b, source_sha, fixture)
        for name in (builder.ARCHIVE_NAME, builder.MANIFEST_NAME, builder.CHECKSUM_NAME):
            assert (out_a / name).read_bytes() == (out_b / name).read_bytes()
            assert (out_a / name).read_bytes() == (out_cli / name).read_bytes()

        files, counts = builder.collect_files(fixture, source_sha)
        assert counts == {"agents": 32, "skill_roots": 26, "extensions": 11, "themes": 1, "top_level": 6}
        assert "agent/extensions/execution-mode.ts" in files
        assert "agent/extensions/project-memory.ts" not in files
        assert not any(name.startswith("agent/extensions/test/") for name in files)
        assert not any(name.startswith("agent/extensions/plastic-memory/") for name in files)
        assert len(files) == len(json.loads((out_a / builder.MANIFEST_NAME).read_text())["files"])

        # Identity is commit-bound: changing the fixture worktree does not change its named commit.
        (fixture / "agents" / "agent-expert.md").write_text("dirty bytes\n")
        files_after_dirty, _ = builder.collect_files(fixture, source_sha)
        assert files_after_dirty == files

        secret = b"ghp_0123456789012345678901234567890123456789"
        secret_repo = work / "secret-fixture"
        secret_sha = make_fixture(secret_repo, mutate=("agents/agent-expert.md", secret))
        assert_rejected(secret_repo, secret_sha, "github-token", secret)

        link_repo = work / "link-fixture"
        link_sha = make_fixture(link_repo, symlink="skills/agent-guide/SKILL.md")
        assert_rejected(link_repo, link_sha, "link", b"symlink-target-must-not-leak")

        personal_path_repo = work / "personal-path-fixture"
        personal_path = b"/Users/private-machine-only/example"
        personal_path_sha = make_fixture(
            personal_path_repo,
            mutate=("agents/agent-expert.md", personal_path),
        )
        assert_rejected(personal_path_repo, personal_path_sha, "absolute-user-path", personal_path)

        missing_reference_repo = work / "missing-reference-fixture"
        missing_reference_sha = make_fixture(
            missing_reference_repo,
            mutate=("skills/agent-guide/SKILL.md", b"[missing](missing.md)\n"),
        )
        assert_rejected(missing_reference_repo, missing_reference_sha, "missing-local-reference", b"missing.md")

        invalid_json_repo = work / "json-fixture"
        invalid_json_sha = make_fixture(
            invalid_json_repo,
            mutate=("config/settings.json", b"{not json}\n"),
        )
        # JSON validation is deliberately a syntax check, with path-only diagnostics.
        assert_rejected(invalid_json_repo, invalid_json_sha, "invalid-json", b"not json")

    print("build-ymir-profile smoke: PASS")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as exc:
        print(f"build-ymir-profile smoke: FAIL: {exc}", file=sys.stderr)
        raise
