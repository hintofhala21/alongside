#!/bin/bash
cd -- "$(dirname -- "${BASH_SOURCE[0]}")" || exit 1
python3 scripts/setup-ai.py
read -r -p "Press Return to close this window."
