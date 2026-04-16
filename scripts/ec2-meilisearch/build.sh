#!/usr/bin/env bash
# Install and run Meilisearch on EC2 (Docker), aligned with InstiLibreChat / LibreChat compose (v1.12.3).
#
# Usage:
#   # Optional: create the key file at root first (then run this script as root):
#   sudo openssl rand -hex 32 | sudo tee /.meili_master_key
#   sudo chmod 600 /.meili_master_key
#   sudo ./build.sh
#
#   Or pass the key only via env:
#   export MEILI_MASTER_KEY="$(openssl rand -hex 32)"
#   sudo -E ./build.sh
#
# Optional environment:
#   MEILI_MASTER_KEY_FILE=/.meili_master_key   # default; where key is read/written
#   MEILI_VERSION=v1.12.3          # default; match packages/data-schemas + docker-compose
#   MEILI_DATA=/var/lib/meilisearch # host data directory (persisted)
#   MEILI_PORT=7700
#   MEILI_BIND=0.0.0.0             # listen address (use 127.0.0.1 + reverse proxy if preferred)
#   INSTALL_DOCKER=1               # try to install Docker when missing (Amazon Linux / Ubuntu)
#   CONTAINER_NAME=meilisearch
#
# After this runs, point LibreChat at:
#   MEILI_HOST=http://<this-instance-private-ip>:7700   (or internal DNS / LB URL)
#   MEILI_MASTER_KEY=<same value as above>
#
# Lock down security group: allow TCP ${MEILI_PORT} only from your API hosts, not the public internet.
#
# Other HTTP checks (base URL = http://127.0.0.1:7700 or MEILI_HOST; KEY = MEILI_MASTER_KEY or cat /.meili_master_key):
#   curl -sS http://127.0.0.1:7700/health                    # usually no auth
#   curl -sS -H "Authorization: Bearer $KEY" .../version   # engine version
#   curl -sS -H "Authorization: Bearer $KEY" .../indexes   # lists indexes (LibreChat uses messages + convos)
#   curl -sS -H "Authorization: Bearer $KEY" .../indexes/messages/stats
#   curl -sS -H "Authorization: Bearer $KEY" .../indexes/convos/stats
#   curl -sS -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
#        -d '{"q":"test","limit":1}' http://127.0.0.1:7700/indexes/messages/search
#   curl -sS -H "Authorization: Bearer $KEY" .../tasks?limit=5   # recent indexing tasks
# (Meilisearch v1 REST: https://www.meilisearch.com/docs/reference/api/overview)

set -euo pipefailcd 

MEILI_VERSION="${MEILI_VERSION:-v1.12.3}"
MEILI_MASTER_KEY_FILE="${MEILI_MASTER_KEY_FILE:-/.meili_master_key}"
MEILI_DATA="${MEILI_DATA:-/var/lib/meilisearch}"
MEILI_PORT="${MEILI_PORT:-7700}"
MEILI_BIND="${MEILI_BIND:-0.0.0.0}"
CONTAINER_NAME="${CONTAINER_NAME:-meilisearch}"
IMAGE="getmeili/meilisearch:${MEILI_VERSION}"

log() { printf '%s\n' "$*"; }

require_root() {
  if [[ "${EUID:-0}" -ne 0 ]]; then
    log "Run as root (e.g. sudo -E ./build.sh) so Docker and ${MEILI_DATA} can be configured."
    exit 1
  fi
}

install_docker() {
  if command -v docker >/dev/null 2>&1; then
    return 0
  fi
  if [[ "${INSTALL_DOCKER:-0}" != "1" ]]; then
    log "Docker is not installed. Install Docker, or re-run with INSTALL_DOCKER=1"
    exit 1
  fi
  if [[ ! -f /etc/os-release ]]; then
    log "Cannot detect OS. Install Docker manually."
    exit 1
  fi
  # shellcheck source=/dev/null
  source /etc/os-release
  log "Installing Docker (${ID:-unknown})..."
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
      log "Unsupported ID=${ID}. Install Docker manually, then re-run."
      exit 1
      ;;
  esac
  systemctl enable --now docker
}

ensure_master_key() {
  local keyfile="${MEILI_MASTER_KEY_FILE}"
  if [[ -n "${MEILI_MASTER_KEY:-}" ]]; then
    log "Using MEILI_MASTER_KEY from the environment"
    return 0
  fi
  if [[ -f "$keyfile" ]]; then
    MEILI_MASTER_KEY="$(tr -d '\n\r' <"$keyfile")"
    export MEILI_MASTER_KEY
    log "Using existing MEILI_MASTER_KEY from ${keyfile}"
    return 0
  fi
  log "MEILI_MASTER_KEY is not set and ${keyfile} is missing."
  log "Generating a new key and saving to ${keyfile}"
  MEILI_MASTER_KEY="$(openssl rand -hex 32)"
  printf '%s' "$MEILI_MASTER_KEY" >"$keyfile"
  chmod 600 "$keyfile"
  export MEILI_MASTER_KEY
  log "IMPORTANT: Add this to LibreChat / SSM (same value required by the API):"
  log "  MEILI_MASTER_KEY=${MEILI_MASTER_KEY}"
}

main() {
  require_root
  install_docker
  ensure_master_key

  mkdir -p "$MEILI_DATA"
  chmod 700 "$MEILI_DATA" 2>/dev/null || true

  docker pull "$IMAGE"

  if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
    log "Stopping/removing existing container ${CONTAINER_NAME}..."
    docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
    docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true
  fi

  log "Starting Meilisearch ${MEILI_VERSION} on ${MEILI_BIND}:${MEILI_PORT} (data: ${MEILI_DATA})..."
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
  if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
    log "Meilisearch is running."
    log "Configure LibreChat with:"
    log "  MEILI_HOST=http://<this-host>:${MEILI_PORT}"
    log "  MEILI_MASTER_KEY=<same as above or cat ${MEILI_MASTER_KEY_FILE}>"
  else
    log "Container may have failed. Check: docker logs ${CONTAINER_NAME}"
    exit 1
  fi
}

main "$@"
