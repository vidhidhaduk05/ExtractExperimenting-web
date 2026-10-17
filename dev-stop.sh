#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -d "$SCRIPT_DIR/.venv/bin" ]; then
    export PATH="$SCRIPT_DIR/.venv/bin:$PATH"
fi
python3 "$SCRIPT_DIR/dev-stop.py" "$@"
