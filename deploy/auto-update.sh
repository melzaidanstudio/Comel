#!/usr/bin/env bash
# Auto-deploy Comel: bila ada commit baru di GitHub (branch main), tarik lalu jalankan install-vps.sh.
# Dijalankan tiap 5 menit oleh systemd timer `comel-auto-update.timer`
# (dipasang sekali dengan: bash /opt/comel/deploy/enable-auto-update.sh).
#
# Jalankan manual:  systemctl start comel-auto-update     (atau: bash /opt/comel/deploy/auto-update.sh)
# Lihat log:        tail -n 50 /var/log/comel-auto-update.log
# Pasang ulang commit yang sama (mis. setelah gagal):
#                   rm /var/lib/comel-auto-update/last && systemctl start comel-auto-update
set -uo pipefail

APP_DIR=$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)
BRANCH=${COMEL_BRANCH:-main}
STATE_DIR=${COMEL_STATE_DIR:-/var/lib/comel-auto-update}
LOG=${COMEL_UPDATE_LOG:-/var/log/comel-auto-update.log}
export GIT_TERMINAL_PROMPT=0 # jangan menunggu username/password di latar belakang; langsung gagal saja

log() { printf '%s %s\n' "$(date '+%F %T')" "$*" >> "$LOG"; }
mark() { echo "$TARGET $1 $(date +%s)" > "$STATE_DIR/last"; } # commit terakhir yang dicoba + hasilnya

mkdir -p "$STATE_DIR" "$(dirname "$LOG")"
exec 9> "$STATE_DIR/lock"
flock -n 9 || exit 0 # update sebelumnya masih berjalan

cd "$APP_DIR" || { log "✗ folder $APP_DIR tidak ada"; exit 1; }
CUR=$(git symbolic-ref --quiet --short HEAD || echo '(detached)')
if [ "$CUR" != "$BRANCH" ]; then
  log "✗ $APP_DIR sedang di branch $CUR, bukan $BRANCH — auto-deploy dilewati"
  exit 1
fi
if ! git fetch --quiet origin "$BRANCH" 2>> "$LOG"; then
  log "✗ git fetch gagal (koneksi atau izin GitHub?)"
  exit 1
fi
TARGET=$(git rev-parse FETCH_HEAD)
LAST=$(cut -d' ' -f1 "$STATE_DIR/last" 2>/dev/null || true)
[ "$TARGET" = "$LAST" ] && exit 0 # tidak ada commit baru sejak percobaan terakhir

SHORT=${TARGET:0:7}
log "▶ commit $SHORT: $(git log -1 --format=%s "$TARGET")"
if [ "$(git rev-parse HEAD)" != "$TARGET" ] && ! git merge --ff-only --quiet "$TARGET" >> "$LOG" 2>&1; then
  log "✗ $SHORT tidak bisa ditarik (ada perubahan lokal?). Cek: cd $APP_DIR && git status"
  mark gagal-pull
  exit 1
fi
if bash deploy/install-vps.sh < /dev/null >> "$LOG" 2>&1; then
  log "✓ $SHORT terpasang"
  mark ok
else
  log "✗ $SHORT gagal dipasang (lihat baris di atas). Dicoba lagi saat ada commit baru."
  mark gagal
fi
# log tidak dibiarkan membesar
tail -n 3000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
grep -q "^$TARGET ok " "$STATE_DIR/last"
