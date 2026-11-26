#!/bin/bash
set -e
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
nodebin="$(command -v node || true)"
if [[ -z "$nodebin" ]]; then nodebin="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"; fi
if [[ ! -x "$nodebin" ]]; then echo "Node.js is needed to run Alongside on this Mac."; read -r; exit 1; fi
. scripts/build-mac-calendar.sh
"$nodebin" scripts/build.mjs
open "$app"
