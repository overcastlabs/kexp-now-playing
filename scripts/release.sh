#!/usr/bin/env bash

set -euo pipefail

bump="${1:-}"

case "$bump" in
  patch|minor|major) ;;
  *)
    echo "Usage: scripts/release.sh <patch|minor|major>" >&2
    exit 1
    ;;
esac

repository_root="$(git rev-parse --show-toplevel)"
cd "$repository_root"

if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "Releases must be created from the main branch" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "The working tree must be clean before creating a release" >&2
  git status --short >&2
  exit 1
fi

git fetch origin main --tags

if ! git merge-base --is-ancestor origin/main HEAD; then
  echo "Local main does not contain the latest origin/main commit" >&2
  echo "Pull or rebase before creating a release" >&2
  exit 1
fi

version="$(node scripts/bump-version.mjs "$bump")"
tag="v${version}"

if git rev-parse --verify --quiet "refs/tags/${tag}" >/dev/null; then
  echo "Tag already exists: $tag" >&2
  git restore manifest.json
  exit 1
fi

git add manifest.json
git commit -m "Release ${tag}"
git tag --annotate "$tag" --message "Release ${tag}"

started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Pushing main and ${tag} atomically…"
if ! git push --atomic origin HEAD:main "refs/tags/${tag}"; then
  echo >&2
  echo "Push failed. The release commit and tag remain local." >&2
  echo "Resolve the Git error, then run:" >&2
  echo "  git push --atomic origin HEAD:main refs/tags/${tag}" >&2
  exit 1
fi

echo
echo "Release ${tag} pushed. GitHub Actions will package, release, and publish it."

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  scripts/watch-workflow.sh release.yml "Release ${tag}" "$started_at"
else
  echo "Install and authenticate GitHub CLI to watch from the terminal: make release-status TAG=${tag}"
fi
