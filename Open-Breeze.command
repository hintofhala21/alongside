#!/bin/bash
set -eu
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
nodebin="$(command -v node || true)"
if [[ -z "$nodebin" ]]; then nodebin="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"; fi
if [[ ! -x "$nodebin" ]]; then echo 'Breeze needs Node.js on this Mac.'; exit 1; fi
if "$nodebin" --input-type=module -e '
  try {
    const response = await fetch("http://127.0.0.1:4175/config.json", {signal:AbortSignal.timeout(1000), redirect:"error"});
    const config = await response.json();
    const expected = JSON.parse(await (await import("node:fs/promises")).readFile("site/config.json","utf8"));
    if (response.ok && config.apiBase === expected.apiBase && (!config.calendarTools || config.chatVersion !== 15)) process.exit(42);
    process.exitCode = response.ok && config.apiBase === expected.apiBase && config.localBreeze === "live" ? 0 : 1;
  } catch { process.exitCode = 1; }
'; then
  echo 'Breeze is already running. Open http://127.0.0.1:4175/#support'
  open 'http://127.0.0.1:4175/#support'
  exit 0
elif [[ $? == 42 ]]; then
  echo 'An older Breeze window is still running. In the Terminal window showing Alongside on port 4175, press Control+C. Then open this launcher again.'
  exit 1
fi
if [[ -z "${OPENAI_API_KEY:-}" && ! -f .env.local ]]; then
  echo 'Alongside uses your project’s OpenAI API key for live replies.'
  echo 'Paste the key here and press Return. The key stays hidden while you type.'
  IFS= read -rs OPENAI_API_KEY
  echo
  if [[ -z "$OPENAI_API_KEY" ]]; then echo 'No key entered. Setup closed.'; exit 1; fi
  export OPENAI_API_KEY
fi
. scripts/build-mac-calendar.sh
"$nodebin" scripts/build.mjs
echo 'Keep this window open while using Breeze.'
ALONGSIDE_OPEN_CHAT=1 exec "$nodebin" scripts/preview.mjs
