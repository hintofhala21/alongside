#!/bin/bash
set -eu
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
nodebin="$(command -v node || true)"
if [[ -z "$nodebin" ]]; then nodebin="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"; fi
if [[ -z "${GOOGLE_PLACES_API_KEY:-}" ]]; then
  echo 'Enter your Google Places API (New) key for this visit. Input is hidden.'
  IFS= read -rs GOOGLE_PLACES_API_KEY
  echo
  [[ -n "$GOOGLE_PLACES_API_KEY" ]] || exit 1
  export GOOGLE_PLACES_API_KEY
fi
ALONGSIDE_FIND_CARE=1 exec "$nodebin" scripts/preview.mjs
