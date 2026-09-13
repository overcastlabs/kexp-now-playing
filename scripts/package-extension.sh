#!/usr/bin/env bash

set -euo pipefail

archive_path="${1:-}"

if [[ -z "$archive_path" ]]; then
  echo "Usage: scripts/package-extension.sh <output.zip>" >&2
  exit 1
fi

required_files=(
  manifest.json
  config.js
  service-worker.js
  app.html
  app.css
  app.js
)

for file in "${required_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "Required extension file is missing: $file" >&2
    exit 1
  fi
done

module_files=()
while IFS= read -r file; do
  module_files+=("$file")
done < <(find js -type f -name '*.js' -print | sort)

style_files=()
while IFS= read -r file; do
  style_files+=("$file")
done < <(find styles -type f -name '*.css' -print | sort)

if [[ ${#module_files[@]} -eq 0 || ${#style_files[@]} -eq 0 ]]; then
  echo "JavaScript modules or component styles are missing" >&2
  exit 1
fi

image_files=()
while IFS= read -r file; do
  image_files+=("$file")
done < <(find images -type f \( -name '*.png' -o -name '*.svg' \) -print | sort)

if [[ ${#image_files[@]} -eq 0 ]]; then
  echo "No extension images were found" >&2
  exit 1
fi

mkdir -p "$(dirname "$archive_path")"
rm -f "$archive_path"
zip -q -9 "$archive_path" \
  "${required_files[@]}" \
  "${module_files[@]}" \
  "${style_files[@]}" \
  "${image_files[@]}"
zip -T "$archive_path"
