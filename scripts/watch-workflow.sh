#!/usr/bin/env bash

set -euo pipefail

workflow="${1:-}"
run_name="${2:-}"
not_before="${3:-1970-01-01T00:00:00Z}"

if [[ -z "$workflow" || -z "$run_name" ]]; then
  echo "Usage: scripts/watch-workflow.sh <workflow-file> <run-name>" >&2
  exit 1
fi

if [[ ! "$workflow" =~ ^(release|publish-chrome)\.yml$ ]] ||
   [[ ! "$run_name" =~ ^(Release|Publish)\ v[0-9]+\.[0-9]+\.[0-9]+$ ]] ||
   [[ ! "$not_before" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]]; then
  echo "Invalid workflow watcher arguments" >&2
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

echo "Waiting for GitHub Actions run: ${run_name}"
run_id=""

for _ in {1..30}; do
  run_id="$(
    gh run list \
      --workflow "$workflow" \
      --limit 30 \
      --json databaseId,displayTitle,createdAt \
      --jq ".[] | select(.displayTitle == \"${run_name}\" and .createdAt >= \"${not_before}\") | .databaseId" \
      | head -n 1
  )"

  if [[ -n "$run_id" ]]; then
    break
  fi

  sleep 2
done

if [[ -z "$run_id" ]]; then
  echo "Timed out waiting for the workflow run to appear" >&2
  exit 1
fi

gh run watch "$run_id" --exit-status
