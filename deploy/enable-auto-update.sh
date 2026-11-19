#!/usr/bin/env bash
# Aktifkan auto-deploy Comel: VPS mengecek GitHub tiap 5 menit dan memasang sendiri commit baru di branch main.
# Cukup sekali, sebagai root (mis. dari Browser terminal hPanel Hostinger):
#   cd /opt/comel && git pull && bash deploy/enable-auto-update.sh
# Matikan lagi:
#   bash /opt/comel/deploy/enable-auto-update.sh --off
set -euo pipefail

say()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Jalankan sebagai root (sudo bash $0)"
APP_DIR=$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)
UNIT=comel-auto-update
BRANCH=main
LOG=/var/log/comel-auto-update.log
command -v systemctl >/dev/null 2>&1 || die "systemd tidak ada di server ini"

if [ "${1:-}" = "--off" ]; then
  systemctl disable --now "$UNIT.timer" 2>/dev/null || true
  rm -f "/etc/systemd/system/$UNIT.timer" "/etc/systemd/system/$UNIT.service"
  systemctl daemon-reload
  ok "Auto-deploy dimatikan. Update manual: cd $APP_DIR && git pull && bash deploy/install-vps.sh"
  exit 0
fi

command -v flock >/dev/null 2>&1 || die "Perintah flock tidak ada (apt-get install -y util-linux)"
[ "$(git -C "$APP_DIR" symbolic-ref --quiet --short HEAD || true)" = "$BRANCH" ] \
  || die "$APP_DIR harus berada di branch $BRANCH (git -C $APP_DIR checkout $BRANCH)"

# ---------- 1. git fetch harus jalan tanpa ditanya password ----------
say "Memeriksa akses GitHub tanpa password"
fetch() { GIT_TERMINAL_PROMPT=0 git -C "$APP_DIR" fetch --quiet origin "$BRANCH" 2>/dev/null; }
if ! fetch; then
  URL=$(git -C "$APP_DIR" remote get-url origin)
  case "$URL" in https://*) ;; *) die "Remote origin bukan https ($URL). Pastikan 'git fetch' berjalan tanpa password, lalu ulangi." ;; esac
  warn "Repo private: VPS butuh token GitHub agar bisa menarik update sendiri (cukup sekali)."
  echo "Buat token di GitHub → Settings → Developer settings → Fine-grained tokens:"
  echo "  Repository access: hanya repo ini · Permissions → Contents: Read-only"
  printf 'Tempel token (tidak terlihat saat diketik), lalu Enter: ' > /dev/tty
  read -rs TOKEN < /dev/tty; echo > /dev/tty
  [ -n "$TOKEN" ] || die "Token kosong"
  REST=${URL#https://}; REST=${REST#*@}; HOST=${REST%%/*}
  CRED=/root/.git-credentials-comel
  (umask 077; printf 'https://x-access-token:%s@%s\n' "$TOKEN" "$HOST" > "$CRED")
  # hanya dipakai repo ini; repo lain di VPS tidak terpengaruh
  git -C "$APP_DIR" config credential.helper "store --file $CRED"
  fetch || die "GitHub menolak token. Cek izin token (Contents: Read-only untuk repo ini), lalu jalankan lagi."
fi
ok "git fetch tanpa password: OK"

# ---------- 2. systemd timer ----------
say "Memasang timer $UNIT (cek tiap 5 menit)"
cat > "/etc/systemd/system/$UNIT.service" <<UNIT_SERVICE
[Unit]
Description=Comel auto-deploy (tarik commit baru dari GitHub lalu pasang)
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
Environment=COMEL_BRANCH=$BRANCH
# layanan systemd tanpa User= tidak mendapat HOME; git & docker membaca konfigurasinya dari /root
Environment=HOME=/root
ExecStart=/usr/bin/env bash $APP_DIR/deploy/auto-update.sh
Nice=10
TimeoutStartSec=45min
UNIT_SERVICE
cat > "/etc/systemd/system/$UNIT.timer" <<UNIT_TIMER
[Unit]
Description=Cek update Comel tiap 5 menit

[Timer]
OnActiveSec=10s
OnBootSec=2min
OnUnitInactiveSec=5min
RandomizedDelaySec=30s
Unit=$UNIT.service

[Install]
WantedBy=timers.target
UNIT_TIMER
systemctl daemon-reload
systemctl enable --now "$UNIT.timer" >/dev/null
ok "Timer aktif"

# ---------- 3. update pertama sekarang (di latar belakang) ----------
systemctl start --no-block "$UNIT.service"
cat <<DONE

==============================================================
  Auto-deploy aktif 🎉
  Update pertama sedang berjalan di latar belakang (±5–10 menit).
  Terminal ini boleh ditutup.

  Setiap commit baru di branch $BRANCH dipasang otomatis
  (dicek tiap 5 menit).

  Log:       tail -n 50 $LOG
  Status:    systemctl list-timers $UNIT.timer
  Matikan:   bash $APP_DIR/deploy/enable-auto-update.sh --off
==============================================================
DONE
