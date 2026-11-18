#!/usr/bin/env bash
# Pasang / perbarui Comel di VPS Linux (Ubuntu/Debian) dengan Docker.
#
# Pemakaian (sebagai root, mis. dari Browser terminal hPanel Hostinger):
#   git clone https://github.com/melzaidanstudio/comel.git /opt/comel
#   bash /opt/comel/deploy/install-vps.sh
# Update:
#   cd /opt/comel && git pull && bash deploy/install-vps.sh
#
# Yang dilakukan:
#   1. memasang Docker bila belum ada;
#   2. membuat .env (rahasia acak, domain gratis sslip.io dari IP VPS) bila belum ada;
#   3. memilih port lokal yang kosong (tidak mengganggu aplikasi lain di VPS);
#   4. build & menjalankan db + migrate + web + worker;
#   5. HTTPS: bila nginx sudah dipakai di port 80/443 → menambah situs nginx + sertifikat
#      Let's Encrypt (certbot); bila port 80/443 kosong → memakai Caddy bawaan.
set -euo pipefail

say()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Jalankan sebagai root (sudo bash $0)"
cd "$(dirname "$(readlink -f "$0")")/.."
APP_DIR=$(pwd)
[ -f docker-compose.yml ] || die "docker-compose.yml tidak ditemukan di $APP_DIR"

# ---------- .env helper ----------
env_get() { grep -E "^$1=" .env 2>/dev/null | tail -n1 | cut -d= -f2- || true; }
env_set() { # env_set KEY VALUE — ganti baris yang ada atau tambahkan
  local k=$1 v=$2 tmp
  tmp=$(mktemp)
  awk -v k="$k" -v v="$v" 'BEGIN{done=0} $0 ~ "^"k"=" {print k"="v; done=1; next} {print} END{if(!done) print k"="v}' .env > "$tmp"
  cat "$tmp" > .env && rm -f "$tmp"
}
port_used() { ss -ltnH "( sport = :$1 )" 2>/dev/null | grep -q .; }

# ---------- 1. Docker ----------
say "Memeriksa Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || die "Plugin 'docker compose' tidak ada. Pasang: apt-get install -y docker-compose-plugin"
ok "$(docker --version)"

# ---------- 2. .env ----------
say "Menyiapkan konfigurasi (.env)"
[ -f .env ] || cp .env.example .env
chmod 600 .env
case "$(env_get POSTGRES_PASSWORD)" in ''|ganti-*) env_set POSTGRES_PASSWORD "$(openssl rand -hex 16)";; esac
case "$(env_get BETTER_AUTH_SECRET)" in ''|ganti-*) env_set BETTER_AUTH_SECRET "$(openssl rand -hex 32)";; esac
case "$(env_get SECRET_KEY)" in ''|ganti-*) env_set SECRET_KEY "$(openssl rand -hex 32)";; esac

EMAIL=$(env_get ADMIN_EMAIL)
case "$EMAIL" in *@contoh.com|'') EMAIL='';; esac
while [ -z "$EMAIL" ]; do
  printf 'Email untuk akun admin dashboard Comel: ' > /dev/tty
  read -r EMAIL < /dev/tty
  [[ "$EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || { warn "Email tidak valid"; EMAIL=''; }
done
env_set ADMIN_EMAIL "$EMAIL"

DOMAIN=$(env_get DOMAIN)
case "$DOMAIN" in ''|*203-0-113-5*)
  IP=$(curl -fsS4 --max-time 10 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
  [ -n "$IP" ] || die "Tidak bisa mengetahui IP publik VPS; isi DOMAIN di .env"
  DOMAIN="comel.${IP//./-}.sslip.io"
  env_set DOMAIN "$DOMAIN";;
esac
env_set BETTER_AUTH_URL "https://$DOMAIN"

WEB_PORT=$(env_get WEB_PORT)
if [ -z "$WEB_PORT" ]; then
  WEB_PORT=3100
  while port_used "$WEB_PORT"; do WEB_PORT=$((WEB_PORT + 1)); done
  env_set WEB_PORT "$WEB_PORT"
fi
ok "Domain: https://$DOMAIN  (dashboard lokal 127.0.0.1:$WEB_PORT)"

# ---------- 3. mode HTTPS ----------
MODE=none
if port_used 80 || port_used 443; then
  if ss -ltnpH '( sport = :80 or sport = :443 )' 2>/dev/null | grep -q '"nginx"'; then MODE=nginx
  elif docker compose -p comel ps --services --status running 2>/dev/null | grep -qx caddy; then MODE=caddy
  else MODE=other
  fi
else
  MODE=caddy
fi

# ---------- 4. build & jalankan ----------
say "Build & menjalankan Comel (build pertama ±5–10 menit)"
PROFILE=()
[ "$MODE" = caddy ] && PROFILE=(--profile https)
docker compose -p comel "${PROFILE[@]}" up -d --build --remove-orphans

printf 'Menunggu dashboard siap'
for _ in $(seq 1 90); do
  if curl -fsS -o /dev/null "http://127.0.0.1:$WEB_PORT/login"; then break; fi
  printf '.'; sleep 2
done
echo
curl -fsS -o /dev/null "http://127.0.0.1:$WEB_PORT/login" || die "Dashboard belum menjawab. Cek: docker compose -p comel logs --tail 100 web migrate"
ok "Dashboard berjalan di 127.0.0.1:$WEB_PORT"

# ---------- 5. HTTPS ----------
if [ "$MODE" = nginx ]; then
  say "Menambahkan situs nginx untuk $DOMAIN"
  if [ -d /etc/nginx/sites-available ] && grep -q 'sites-enabled' /etc/nginx/nginx.conf; then
    CONF=/etc/nginx/sites-available/comel.conf; LINK=/etc/nginx/sites-enabled/comel.conf
  else
    CONF=/etc/nginx/conf.d/comel.conf; LINK=''
  fi
  if [ ! -f "$CONF" ] || ! grep -q "server_name $DOMAIN;" "$CONF"; then
    cat > "$CONF" <<NGINX
# Comel — dibuat oleh deploy/install-vps.sh
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:$WEB_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
    }
}
NGINX
    [ -n "$LINK" ] && ln -sf "$CONF" "$LINK"
    if ! nginx -t 2>/dev/null; then
      rm -f "$CONF" ${LINK:+"$LINK"}
      nginx -t || true
      die "Konfigurasi nginx tidak valid — dibatalkan, situs lain tidak diubah."
    fi
    systemctl reload nginx
    ok "nginx: $DOMAIN → 127.0.0.1:$WEB_PORT"
  fi
  if ! grep -q 'ssl_certificate' "$CONF"; then
    say "Mengambil sertifikat HTTPS (Let's Encrypt)"
    if ! command -v certbot >/dev/null 2>&1 || ! certbot plugins 2>/dev/null | grep -q nginx; then
      apt-get update -qq && apt-get install -y -qq certbot python3-certbot-nginx
    fi
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect \
      || die "certbot gagal. Pastikan port 80 & 443 terbuka di firewall hPanel, lalu jalankan skrip ini lagi."
  fi
  ok "HTTPS aktif"
elif [ "$MODE" = caddy ]; then
  command -v ufw >/dev/null 2>&1 && ufw status | grep -q 'Status: active' && ufw allow 80,443/tcp >/dev/null || true
  ok "HTTPS via Caddy (sertifikat dibuat otomatis dalam ±1 menit)"
else
  warn "Port 80/443 dipakai program selain nginx. Arahkan reverse proxy Anda: $DOMAIN → http://127.0.0.1:$WEB_PORT"
fi

# ---------- selesai ----------
cat <<DONE

==============================================================
  Comel siap 🎉
  Buka di HP:   https://$DOMAIN
  Buat akun admin dengan email: $EMAIL
  Webhook Repliz: https://$DOMAIN/api/webhooks/repliz

  Log:     cd $APP_DIR && docker compose -p comel logs -f web worker
  Update:  cd $APP_DIR && git pull && bash deploy/install-vps.sh
  Simpan $APP_DIR/.env baik-baik (berisi kunci enkripsi).
==============================================================
DONE
