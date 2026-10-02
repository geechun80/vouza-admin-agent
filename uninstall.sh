#!/usr/bin/env bash
# =============================================================================
# Vouza Admin Agent — uninstaller (Mac / Linux)
#
# Removes this copy completely: optional copy of your settings to the
# Desktop, asks you to type YES, stops the agent (only processes from this
# folder), removes its PM2 entry, then deletes this folder.
# Never touches Node.js, Ollama, or another copy of the agent.
#
# Docker users: run `docker compose down` in this folder first.
# Usage:  ./uninstall.sh
# =============================================================================
set -u

APP_DIR="$(cd "$(dirname "$0")" && pwd)"

refuse() { echo; echo "  $1"; echo "  Nothing was changed."; exit 1; }

# Only ever delete a real Admin Agent folder
[ -f "$APP_DIR/package.json" ] && [ -f "$APP_DIR/start.bat" ] \
  && grep -q '"name": "admin-agent"' "$APP_DIR/package.json" \
  || refuse "This doesn't look like an Admin Agent folder: $APP_DIR"
case "$APP_DIR" in
  "/"|"$HOME"|"$HOME/Desktop"|"$HOME/Documents") refuse "Refusing to delete $APP_DIR — it is a system or personal folder." ;;
esac

echo
echo "  Uninstall Vouza Admin Agent"
echo "  This removes: $APP_DIR"
echo "  (stops it, removes its PM2 entry, deletes the folder incl. settings, chats and WhatsApp login)"
echo "  Node.js and Ollama are NOT removed."
echo

if [ -d "$APP_DIR/data" ]; then
  read -r -p "  Keep a copy of your settings on your Desktop first? (y/N) " KEEP
  if [[ "$KEEP" =~ ^[Yy] ]]; then
    DEST="$HOME/Desktop/Vouza Admin Agent backup $(date '+%Y-%m-%d %H%M')"
    mkdir -p "$DEST" && cp -R "$APP_DIR/data" "$DEST/" \
      && { [ ! -f "$APP_DIR/.env" ] || cp "$APP_DIR/.env" "$DEST/"; } \
      || refuse "Couldn't save the copy of your settings."
    printf '%s\n' "To restore: install the Admin Agent again, then copy this data folder" \
      "(and .env, if present) into the new folder BEFORE starting it." > "$DEST/HOW TO RESTORE.txt"
    echo "  Saved a copy to: $DEST"
  fi
fi

read -r -p "  Type YES (capital letters) to delete the Admin Agent completely: " OK
if [ "$OK" != "YES" ]; then echo "  Cancelled. Nothing was deleted."; exit 0; fi

if command -v pm2 >/dev/null 2>&1 && pm2 jlist 2>/dev/null | grep -qF "$APP_DIR"; then
  pm2 delete admin-agent >/dev/null 2>&1; pm2 save >/dev/null 2>&1
  echo "  Removed it from PM2."
fi

# Stop processes started from this folder (never this script itself)
for pid in $(pgrep -f -- "$APP_DIR" 2>/dev/null); do
  if [ "$pid" != "$$" ] && [ "$pid" != "$PPID" ]; then kill "$pid" 2>/dev/null && echo "  Stopped process $pid"; fi
done

cd / && rm -rf -- "$APP_DIR" && echo "  Vouza Admin Agent has been removed."
