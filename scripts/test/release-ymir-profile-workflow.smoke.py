#!/usr/bin/env python3
"""Offline policy checks for the manual Ymir profile release workflow."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github" / "workflows" / "release-ymir-profile.yml"
README = ROOT / "README.md"


def require(text: str, pattern: str, label: str) -> None:
    assert re.search(pattern, text, re.MULTILINE), f"missing {label}: {pattern}"


def main() -> None:
    workflow = WORKFLOW.read_text(encoding="utf-8")
    readme = README.read_text(encoding="utf-8")

    # This is deliberately a static check: it never dispatches Actions or calls GitHub.
    require(workflow, r"^on:\s*$", "workflow trigger")
    require(workflow, r"^  workflow_dispatch:\s*$", "manual trigger")
    assert not re.search(
        r"^\s+(?:push|schedule|workflow_call|workflow_run|repository_dispatch):\s*$",
        workflow,
        re.MULTILINE,
    ), "workflow has a non-manual trigger"
    require(workflow, r"^      source_sha:\s*$", "source SHA input")
    require(workflow, r"^        required: true\s*$", "required source SHA")
    require(workflow, r"^        type: string\s*$", "string source SHA")
    require(workflow, r"SOURCE_SHA: \$\{\{ inputs\.source_sha \}\}", "environment input handoff")
    assert "${{ inputs.source_sha }}" not in "\n".join(
        line for line in workflow.splitlines() if line.lstrip().startswith("run:")
    ), "source input is interpolated in a shell command"
    require(workflow, r"\^\[0-9a-f\]\{40\}\$", "lowercase SHA validation")

    require(workflow, r"^permissions: \{\}\s*$", "empty workflow permissions")
    require(workflow, r"^      contents: write\s*$", "minimal release permission")
    assert not re.search(r"(?i)\b(?:pat|personal access token)\b|secrets\.", workflow)
    assert "npm install" not in workflow
    require(
        workflow,
        r"uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd",
        "fixed checkout revision",
    )
    require(workflow, r"persist-credentials: false", "non-persisted checkout credentials")

    require(workflow, r"git fetch --no-tags origin main", "refreshed main")
    require(workflow, r"git merge-base --is-ancestor \"\$SOURCE_SHA\" origin/main", "main ancestry proof")
    require(workflow, r"--source-sha \"\$SOURCE_SHA\"", "exact source build")
    require(workflow, r"mktemp -d", "run-owned temporary output")
    require(workflow, r"PYTHONDONTWRITEBYTECODE=1 python3 scripts/test/release-ymir-profile-workflow\.smoke\.py", "release policy smoke gate")
    require(workflow, r"PYTHONDONTWRITEBYTECODE=1 python3 scripts/test/build-ymir-profile-smoke\.py", "producer smoke gate")

    immutable_endpoint = "repos/Evolvera/evolvera/immutable-releases"
    require(workflow, r"gh api --method GET " + re.escape(immutable_endpoint) + r" --jq '\.enabled'", "read-only immutable-release preflight")
    require(workflow, r'test "\$immutable_enabled" = true', "enabled immutable-release preflight")
    assert not re.search(r"gh api --(?!method GET).*immutable-releases", workflow)
    assert not re.search(r"gh api .*settings", workflow, re.IGNORECASE)
    assert workflow.index(immutable_endpoint) < workflow.index("gh release create"), "immutable preflight follows mutation"

    require(workflow, r'TAG="ymir-profile-\$\{SOURCE_SHA\}"', "immutable tag name")
    require(workflow, r'refs/tags/\$TAG', "remote tag preflight")
    require(workflow, r"gh release view \"\$TAG\"", "release preflight")
    require(workflow, r"refusing to overwrite existing tag", "tag overwrite refusal")
    require(workflow, r"refusing to overwrite existing release", "release overwrite refusal")
    require(workflow, r"group: ymir-profile-release", "serialized promotion group")
    require(workflow, r"cancel-in-progress: false", "non-canceling promotion concurrency")
    assert "--force" not in workflow
    assert "--clobber" not in workflow
    assert not re.search(r"\b(?:git|gh)\s+(?:push|delete)\b", workflow)

    require(workflow, r"gh release create \"\$TAG\"", "draft release creation")
    require(workflow, r"--target \"\$SOURCE_SHA\"", "source-targeted tag creation")
    require(workflow, r"--draft\s*\\?$", "draft release flag")
    require(workflow, r"gh release upload \"\$TAG\"", "fixed asset upload")
    assert workflow.index("gh release create") < workflow.index("gh release upload") < workflow.index('test "$draft" = true') < workflow.index("gh release edit"), "release publication precedes asset verification"
    assert not any(
        workflow.index("gh release create") < match.start() < workflow.index("gh release upload")
        for match in re.finditer(r"git ls-remote", workflow)
    ), "remote tag lookup occurs before draft asset verification"
    require(workflow, r'--json isDraft,tagName,targetCommitish', "draft metadata fields")
    require(workflow, r'draft\["isDraft"\] is True', "draft metadata state")
    require(workflow, r'draft\["tagName"\] == sys\.argv\[2\]', "draft tag identity")
    require(workflow, r'draft\["targetCommitish"\] == sys\.argv\[3\]', "draft source identity")
    for asset in (
        "ymir-profile.tar.gz",
        "ymir-profile.manifest.json",
        "ymir-profile.sha256",
    ):
        assert asset in workflow, f"missing fixed asset: {asset}"
    require(workflow, r"--json assets", "uploaded asset verification")
    require(workflow, r"test \"\$draft\" = true", "publish-after-draft verification")
    require(workflow, r"gh release edit \"\$TAG\"", "release publication")
    require(workflow, r"--draft=false", "non-draft publication")
    require(workflow, r"--prerelease=false", "non-prerelease publication")
    require(workflow, r"--latest", "latest release marking")
    require(workflow, r"--json isDraft,isPrerelease", "published state verification")
    require(workflow, r"published_tag=.*--json tagName", "published tag verification")
    assert "isLatest" not in workflow, "unsupported gh release view field isLatest is used"
    require(workflow, r'gh api --method GET "repos/\$GITHUB_REPOSITORY/releases/latest"', "latest release API proof")
    require(workflow, r'latest\["tag_name"\] == sys\.argv\[2\]', "latest release identity proof")
    require(workflow, r'gh api --method GET "repos/Evolvera/evolvera/releases/tags/\$TAG"', "release API identity query")
    assert workflow.index("releases/latest") > workflow.index("gh release edit")
    require(workflow, r'release\["immutable"\] is True', "provider immutable release proof")
    require(workflow, r'tag_refs="\$\(git ls-remote origin', "published remote tag lookup")
    require(workflow, r'peeled == source_sha if peeled is not None else direct == source_sha', "lightweight or peeled tag proof")
    assert workflow.index("tag_refs=") > workflow.index('release["immutable"] is True')
    require(workflow, r'release\["target_commitish"\] == source_sha', "release target proof")
    require(workflow, r'assert \{asset\["name"\] for asset in release\["assets"\]\} ==', "release asset identity proof")

    assert "## Releases canônicas do perfil Ymir" in readme
    release_section = readme.split("## Releases canônicas do perfil Ymir", 1)[1].split("## ", 1)[0]
    assert "docs/ymir-profile-bundle.md" in release_section
    assert "immutable-releases" in release_section
    assert re.search(r"enabled:true", release_section)
    assert re.search(r"extern|prospectiv|provedor", release_section, re.IGNORECASE)
    assert re.search(r"aprova|aprovação", release_section, re.IGNORECASE)
    assert re.search(r"imut|não substit|sem substituir", release_section, re.IGNORECASE)
    assert re.search(r"rollback|reversão", release_section, re.IGNORECASE)
    assert re.search(r"offline|não.*dispatch|não.*publica", release_section, re.IGNORECASE)
    assert re.search(r"não habilita nem altera settings", release_section, re.IGNORECASE)
    assert "immutable:true" in release_section

    print("release-ymir-profile-workflow smoke: PASS")


if __name__ == "__main__":
    main()
