#!/usr/bin/env bash
set -euo pipefail

EXTENSION_ID="${1:-}"

if [[ -z "$EXTENSION_ID" ]]; then
  echo "Usage: native/install-macos.sh <chrome-extension-id>" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELPER_PATH="$SCRIPT_DIR/dompin-git-helper.cjs"
HOST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
HOST_PATH="$HOST_DIR/com.yosephfr.dompin_git.json"

chmod +x "$HELPER_PATH"
mkdir -p "$HOST_DIR"

cat > "$HOST_PATH" <<JSON
{
  "name": "com.yosephfr.dompin_git",
  "description": "DOMPin local Git helper",
  "path": "$HELPER_PATH",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXTENSION_ID/"]
}
JSON

echo "Installed DOMPin Git helper:"
echo "$HOST_PATH"
