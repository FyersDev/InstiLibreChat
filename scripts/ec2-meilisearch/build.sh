#!/usr/bin/env bash
# One-shot EC2 setup: Docker Meilisearch (v1.12.3) + optional nginx reverse proxy /insti/ → localhost:MEILI_PORT.
#
# Usage (as root):
#   ./build.sh
#
# The script will automatically:
# - Install Docker if missing
# - Install nginx if missing (when WITH_NGINX_PROXY=1, which is default)
# - Create /.meili_master_key with a predefined key if it doesn't exist
# - Start Meilisearch container
# - Configure nginx reverse proxy (if enabled)
#
# Environment (defaults favor nginx + localhost-bound Meilisearch):
#   WITH_NGINX_PROXY=1          # default: install/configure nginx /insti/ → Meili (set 0 for Docker-only)
#   MEILI_MASTER_KEY_FILE=/.meili_master_key
#   MEILI_VERSION=v1.12.3
#   MEILI_DATA=/var/lib/meilisearch
#   MEILI_PORT=7700
#   MEILI_BIND=                # with WITH_NGINX_PROXY=1 defaults to 127.0.0.1; else 0.0.0.0
#   NGINX_LISTEN_PORT=80
#   CONTAINER_NAME=meilisearch
#
# LibreChat (with nginx):
#   MEILI_HOST=https://<this-host>
#   MEILI_PATH_PREFIX=/insti
#   MEILI_MASTER_KEY=<same as key file>
#
# LibreChat (Docker only, WITH_NGINX_PROXY=0):
#   MEILI_HOST=http://<host>:7700
#
# SELinux (Oracle/RHEL): if nginx → Meili returns 502:  sudo setsebool -P httpd_can_network_connect 1
#
# If port 80 is already used, set NGINX_LISTEN_PORT=8080 and open that port in the SG.

set -euo pipefail

WITH_NGINX_PROXY="${WITH_NGINX_PROXY:-1}"
MEILI_VERSION="${MEILI_VERSION:-v1.12.3}"
MEILI_MASTER_KEY_FILE="${MEILI_MASTER_KEY_FILE:-/.meili_master_key}"
MEILI_DATA="${MEILI_DATA:-/var/lib/meilisearch}"
MEILI_PORT="${MEILI_PORT:-7700}"
NGINX_LISTEN_PORT="${NGINX_LISTEN_PORT:-80}"
NGINX_CONF_DEST="/etc/nginx/conf.d/meilisearch-proxy.conf"

if [[ "$WITH_NGINX_PROXY" == "1" ]]; then
  MEILI_BIND="${MEILI_BIND:-127.0.0.1}"
else
  MEILI_BIND="${MEILI_BIND:-0.0.0.0}"
fi

CONTAINER_NAME="${CONTAINER_NAME:-meilisearch}"
IMAGE="getmeili/meilisearch:${MEILI_VERSION}"

log() { printf '%s\n' "$*"; }

require_root() {
  if [[ "${EUID:-0}" -ne 0 ]]; then
    log "This script must be run as root. Use: sudo ./build.sh"
    exit 1
  fi
}

# --- OS package helpers -------------------------------------------------------------

install_docker() {
  if command -v docker >/dev/null 2>&1; then
    return 0
  fi
  log "Docker not found. Installing..."
  if [[ ! -f /etc/os-release ]]; then
    log "Cannot detect OS."
    exit 1
  fi
  # shellcheck source=/dev/null
  source /etc/os-release
  log "[docker] Installing (${ID:-unknown})..."
  case "${ID:-}" in
    amzn)
      if command -v dnf >/dev/null 2>&1; then
        dnf install -y docker
      else
        yum install -y docker
      fi
      ;;
    ubuntu | debian)
      export DEBIAN_FRONTEND=noninteractive
      apt-get update -y
      apt-get install -y docker.io
      ;;
    *)
      log "Unsupported ID=${ID} for automatic Docker install."
      exit 1
      ;;
  esac
  systemctl enable --now docker
}

install_nginx_pkg() {
  if command -v nginx >/dev/null 2>&1; then
    return 0
  fi
  log "nginx not found. Installing..."
  if [[ ! -f /etc/os-release ]]; then
    log "Cannot detect OS."
    exit 1
  fi
  # shellcheck source=/dev/null
  source /etc/os-release
  log "[nginx] Installing package (${ID:-unknown})..."
  case "${ID:-}" in
    amzn | ol | fedora)
      if command -v dnf >/dev/null 2>&1; then
        dnf install -y nginx
      else
        yum install -y nginx
      fi
      ;;
    ubuntu | debian)
      export DEBIAN_FRONTEND=noninteractive
      apt-get update -y
      apt-get install -y nginx
      ;;
    *)
      log "Unsupported ID=${ID} for automatic nginx install."
      exit 1
      ;;
  esac
}

# --- Meilisearch master key ---------------------------------------------------------

ensure_master_key() {
  local keyfile="${MEILI_MASTER_KEY_FILE}"
  local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  local local_keyfile="${script_dir}/.meili_master_key"
  
  if [[ -n "${MEILI_MASTER_KEY:-}" ]]; then
    log "Using MEILI_MASTER_KEY from the environment"
    return 0
  fi
  if [[ -f "$local_keyfile" ]]; then
    MEILI_MASTER_KEY="$(tr -d '\n\r' <"$local_keyfile")"
    export MEILI_MASTER_KEY
    log "Using MEILI_MASTER_KEY from ${local_keyfile}"
    return 0
  fi
  if [[ -f "$keyfile" ]]; then
    MEILI_MASTER_KEY="$(tr -d '\n\r' <"$keyfile")"
    export MEILI_MASTER_KEY
    log "Using MEILI_MASTER_KEY from ${keyfile}"
    return 0
  fi
  log "Creating MEILI_MASTER_KEY → ${keyfile}"
  MEILI_MASTER_KEY="b5d14529968efbe318a76549ca22b0a0cb3c7f286a53d572ae5fe68eb75a9e37"
  printf '%s' "$MEILI_MASTER_KEY" >"$keyfile"
  chmod 600 "$keyfile"
  export MEILI_MASTER_KEY
  log "Created ${keyfile} with predefined master key"
}

# --- Docker Meilisearch -------------------------------------------------------------

run_meilisearch_docker() {
  mkdir -p "$MEILI_DATA"
  chmod 700 "$MEILI_DATA" 2>/dev/null || true

  docker pull "$IMAGE"

  if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
    log "Replacing existing container ${CONTAINER_NAME}..."
    docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
    docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true
  fi

  log "[docker] Starting Meilisearch ${MEILI_VERSION} on ${MEILI_BIND}:${MEILI_PORT}..."
  docker run -d \
    --name "$CONTAINER_NAME" \
    --restart unless-stopped \
    -p "${MEILI_BIND}:${MEILI_PORT}:7700" \
    -v "${MEILI_DATA}:/meili_data" \
    -e MEILI_ENV=production \
    -e MEILI_MASTER_KEY="${MEILI_MASTER_KEY}" \
    -e MEILI_NO_ANALYTICS=true \
    "$IMAGE"

  sleep 2
  if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
    log "Meilisearch container failed. Check: docker logs ${CONTAINER_NAME}"
    exit 1
  fi
  log "[docker] Meilisearch is up."
}

# --- Nginx: /insti/* → http://127.0.0.1:MEILI_PORT/* ---------------------------------

write_nginx_meili_conf() {
  # proxy_pass with trailing slash strips the /insti/ prefix for upstream
  cat >"$NGINX_CONF_DEST" <<NGINXEOF
# Generated by scripts/ec2-meilisearch/build.sh — /insti/ → Meilisearch
server {
    listen ${NGINX_LISTEN_PORT};
    server_name _;

    location /insti/ {
        proxy_pass http://127.0.0.1:${MEILI_PORT}/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 10s;
        client_max_body_size 256M;
    }
}
NGINXEOF
  chmod 644 "$NGINX_CONF_DEST"
  log "[nginx] Wrote ${NGINX_CONF_DEST}"
}

run_nginx_proxy() {
  install_nginx_pkg
  write_nginx_meili_conf
  nginx -t
  systemctl enable nginx 2>/dev/null || true
  systemctl reload nginx 2>/dev/null || systemctl restart nginx
  log "[nginx] Listening ${NGINX_LISTEN_PORT}: /insti/ → http://127.0.0.1:${MEILI_PORT}/"
}

# --- Summary ------------------------------------------------------------------------

print_summary() {
  log ""
  log "=== Done ==="
  if [[ "$WITH_NGINX_PROXY" == "1" ]]; then
    log "Health (via nginx): curl -sS http://127.0.0.1:${NGINX_LISTEN_PORT}/insti/health"
    log "LibreChat env: MEILI_HOST=https://<this-host>  MEILI_PATH_PREFIX=/insti  MEILI_MASTER_KEY=<contents of ${MEILI_MASTER_KEY_FILE}>"
  else
    log "Health (direct):   curl -sS http://127.0.0.1:${MEILI_PORT}/health"
    log "LibreChat env: MEILI_HOST=http://<this-host>:${MEILI_PORT}  MEILI_MASTER_KEY=<${MEILI_MASTER_KEY_FILE}>"
  fi
}

main() {
  require_root
  install_docker
  ensure_master_key
  run_meilisearch_docker

  if [[ "$WITH_NGINX_PROXY" == "1" ]]; then
    run_nginx_proxy
  fi

  print_summary
}

main "$@"
