#!/usr/bin/env bash

set -euo pipefail

tag="${1:-}"

if [[ ! "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Usage: make publish TAG=v1.2.3" >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI is required. Install it from https://cli.github.com/" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Authenticate GitHub CLI first: gh auth login" >&2
  exit 1
fi

if ! gh release view "$tag" >/dev/null 2>&1; then
  echo "GitHub Release does not exist: $tag" >&2
  exit 1
fi

echo "Starting Chrome Web Store publishing retry for ${tag}…"
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
gh workflow run publish-chrome.yml --ref main --field "tag=${tag}"
scripts/watch-workflow.sh publish-chrome.yml "Publish ${tag}" "$started_at"
