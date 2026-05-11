#!/bin/bash

# Full InstiLibreChat deploy: frontend (Vite dev), backend, and insti-proxy.
# Self-contained — no sourcing of other shell scripts.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
NC='\033[0m'

BASE_DIR="/home/ec2-user/insti"
RUN_DIR="$BASE_DIR/run"
LIBRECHAT_DIR="$BASE_DIR/InstiLibreChat"
LIBRECHAT_PROXY_DIR="$LIBRECHAT_DIR/services/proxy"
LIBRECHAT_BRANCH="web-insti-integration"
LIBRECHAT_GIT_URL="${LIBRECHAT_GIT_URL:-git@github.com:FyersDev/InstiLibreChat.git}"
LIBRECHAT_BACKEND_LOG_DIR="$BASE_DIR/logs/librechat-backend"
LIBRECHAT_FRONTEND_LOG_DIR="$BASE_DIR/logs/librechat-frontend"
INSTI_PROXY_LOG_DIR="$BASE_DIR/logs/insti-proxy"
GO_RUN_TMP="$BASE_DIR/tmp/go-run"
LIBRECHAT_BACKEND_PORT="${LIBRECHAT_BACKEND_PORT:-3080}"
INSTI_LIBRE_SSM_ENV_PATH="${INSTI_LIBRE_SSM_ENV_PATH:-/insti/libre/prod}"
AWS_REGION="${AWS_REGION:-ap-south-1}"

print_status()  { echo -e "${GREEN}[✓]${NC} $1"; }
print_error()   { echo -e "${RED}[✗]${NC} $1"; }
print_step()    { echo -e "${CYAN}[→]${NC} $1"; }
print_info()    { echo -e "${BLUE}[ℹ]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[!]${NC} $1"; }

port_listening() { ss -tln 2>/dev/null | grep -q ":$1 "; }

ensure_repo_dir() {
    local repo_dir="$1"
    local branch="$2"
    local repo_url="$3"
    local label="$4"

    if [ -d "$repo_dir/.git" ]; then
        print_status "$label repo present: $repo_dir"
        return 0
    fi

    print_step "Cloning $label ($branch) into $repo_dir..."
    mkdir -p "$(dirname "$repo_dir")"
    git clone --branch "$branch" "$repo_url" "$repo_dir"
    print_status "Cloned $label"
}

ensure_insti_root_layout() {
    print_step "Checking insti root ($BASE_DIR)..."
    if [ ! -d "$BASE_DIR" ]; then
        print_step "Creating insti directory ($BASE_DIR)..."
        mkdir -p "$BASE_DIR"
    fi
    if [ ! -d "$BASE_DIR" ]; then
        print_error "Insti root not found: $BASE_DIR"
        return 1
    fi
    print_status "Insti root present: $BASE_DIR"

    print_step "Checking repository directory ($LIBRECHAT_DIR)..."
    if [ ! -d "$LIBRECHAT_DIR" ]; then
        print_warning "Repository missing — cloning into $LIBRECHAT_DIR"
        ensure_repo_dir "$LIBRECHAT_DIR" "$LIBRECHAT_BRANCH" "$LIBRECHAT_GIT_URL" "InstiLibreChat" || return 1
    fi
    if [ ! -d "$LIBRECHAT_DIR/.git" ]; then
        print_error "Not a git repository: $LIBRECHAT_DIR"
        return 1
    fi
    print_status "Repository present: $LIBRECHAT_DIR"
    echo ""
}

ensure_npm_on_path() {
    command -v npm >/dev/null 2>&1 && command -v node >/dev/null 2>&1
}

librechat_node_version_ok() {
    local version major minor

    version="$(node --version 2>/dev/null | sed 's/^v//')"
    if [ -z "$version" ]; then
        return 1
    fi

    major="${version%%.*}"
    minor="${version#*.}"
    minor="${minor%%.*}"

    if [ "$major" -ge 23 ] 2>/dev/null; then
        return 0
    fi
    if [ "$major" -eq 22 ] && [ "$minor" -ge 12 ] 2>/dev/null; then
        return 0
    fi
    if [ "$major" -eq 20 ] && [ "$minor" -ge 19 ] 2>/dev/null; then
        return 0
    fi
    return 1
}

ensure_go_on_path() {
    command -v go >/dev/null 2>&1
}

setup_go_private_github_modules() {
    export GOPRIVATE="${GOPRIVATE:-github.com/FyersDev/*}"
    export GONOSUMCHECK="${GONOSUMCHECK:-$GOPRIVATE}"
    export GONOPROXY="${GONOPROXY:-$GOPRIVATE}"
}

bg_stop_service() {
    local service_name="$1"
    local port="$2"
    local friendly_name="${3:-$service_name}"
    local pid_file="$RUN_DIR/${service_name}.pid"

    if [ -f "$pid_file" ]; then
        local pid
        pid="$(cat "$pid_file" 2>/dev/null || true)"
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            print_step "Stopping $friendly_name (PID $pid)..."
            kill "$pid" 2>/dev/null || true
            sleep 2
            kill -9 "$pid" 2>/dev/null || true
        else
            print_info "$friendly_name is not running (stale PID file)"
        fi
        rm -f "$pid_file"
    else
        print_info "$friendly_name is not running"
    fi

    if port_listening "$port"; then
        print_warning "Killing lingering process(es) on port $port..."
        local pids
        pids="$(ss -tlnp 2>/dev/null | grep ":$port " | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u)"
        if [ -n "$pids" ]; then
            echo "$pids" | xargs kill -9 2>/dev/null || true
        fi
    fi
}

bg_start_service() {
    local service_name="$1"
    local work_dir="$2"
    local cmd="$3"
    local friendly_name="${4:-$service_name}"
    local pid_file="$RUN_DIR/${service_name}.pid"

    mkdir -p "$RUN_DIR"

    print_step "Starting $friendly_name..."
    nohup bash -lc "cd $(printf '%q' "$work_dir") && eval $cmd" >/dev/null 2>&1 &
    local pid=$!
    echo "$pid" >"$pid_file"
    disown "$pid" 2>/dev/null || true
    print_status "$friendly_name started (PID $pid)"
}

fetch_insti_env_from_ssm() {
    local target="$LIBRECHAT_DIR/.env"
    local parameter_name="$INSTI_LIBRE_SSM_ENV_PATH"
    local aws_err

    if ! command -v aws >/dev/null 2>&1; then
        print_error "AWS CLI is not installed or not on PATH."
        return 1
    fi

    print_step "Fetching .env from SSM parameter $parameter_name..."
    aws_err="$(mktemp)"
    if ! AWS_REGION="$AWS_REGION" aws ssm get-parameter \
        --name "$parameter_name" \
        --with-decryption \
        --query 'Parameter.Value' \
        --output text >"$target" 2>"$aws_err"; then
        print_error "Failed to read SSM parameter $parameter_name"
        if [ -s "$aws_err" ]; then
            print_info "$(tr '\n' ' ' <"$aws_err")"
        fi
        rm -f "$aws_err" "$target"
        return 1
    fi
    rm -f "$aws_err"

    if [ ! -s "$target" ]; then
        print_error "SSM parameter $parameter_name returned no value"
        rm -f "$target"
        return 1
    fi

    print_status "Wrote $target from SSM $parameter_name"
}

ensure_ports_free() {
    local port
    for port in "$@"; do
        local i=0
        local max=15
        while port_listening "$port" && [ "$i" -lt "$max" ]; do
            print_warning "Port $port still in use — cleanup attempt $((i + 1))/$max"
            local pids
            pids="$(ss -tlnp 2>/dev/null | grep ":$port " | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u)"
            if [ -n "$pids" ]; then
                echo "$pids" | xargs kill -9 2>/dev/null || true
            fi
            if command -v fuser >/dev/null 2>&1; then
                fuser -k "${port}/tcp" 2>/dev/null || true
            fi
            if command -v lsof >/dev/null 2>&1; then
                lsof -ti ":$port" 2>/dev/null | xargs kill -9 2>/dev/null || true
            fi
            sleep 1
            i=$((i + 1))
        done
        if port_listening "$port"; then
            print_error "Port $port still busy — bind may fail (check listeners)"
        else
            print_status "Port $port is free"
        fi
    done
}

print_deploy_status() {
    local spec service_name port friendly_name pid_file pid port_state

    echo "================================================"
    echo "  Service status"
    echo "  $(date '+%Y-%m-%d %H:%M:%S')"
    echo "================================================"
    echo ""

    for spec in \
        "librechat-frontend:3090:Frontend" \
        "librechat-backend:3080:Backend" \
        "insti-proxy:7080:Proxy"; do
        IFS=: read -r service_name port friendly_name <<< "$spec"
        pid_file="$RUN_DIR/${service_name}.pid"
        pid="—"
        if [ -f "$pid_file" ]; then
            pid="$(tr -d '[:space:]' <"$pid_file" 2>/dev/null || true)"
            [ -z "$pid" ] && pid="—"
        fi
        if port_listening "$port"; then
            port_state="Listening"
        else
            port_state="Not listening"
        fi
        echo "  $friendly_name ($port): $port_state | PID file: $pid_file | PID: $pid"
    done
    echo ""
}

# ----- Frontend -----

echo "================================================"
echo "  Restart: LibreChat Frontend (Dev Server)"
echo "================================================"
echo ""

ensure_insti_root_layout || exit 1

print_step "Pulling latest ($LIBRECHAT_BRANCH)..."
cd "$LIBRECHAT_DIR"
git fetch origin
git pull origin "$LIBRECHAT_BRANCH"
print_status "$(git log -1 --format='%h %s')"
echo ""

if ! ensure_npm_on_path; then
    print_error "Node.js / npm is not installed or not on PATH."
    print_info "Install: sudo dnf install -y nodejs npm"
    exit 1
fi
if ! librechat_node_version_ok; then
    print_error "Node.js is too old for InstiLibreChat (need 20.19+, 22.12+, or 23+)."
    print_info "NodeSource on OL9: sudo dnf remove -y nodejs-full-i18n && sudo dnf install -y nodejs --allowerasing (after setup_22.x)."
    exit 1
fi

bg_stop_service "librechat-frontend" "3090" "LibreChat Frontend"

NPM_BIN="$(command -v npm)"
if [ -z "$NPM_BIN" ]; then
    print_error "npm not on PATH."
    exit 1
fi
FRONTEND_CMD="\"$NPM_BIN\" run frontend:dev"
bg_start_service "librechat-frontend" "$LIBRECHAT_DIR" "$FRONTEND_CMD" "LibreChat Frontend (Dev, Port 3090)"

echo ""
print_info "Vite HMR is active — frontend changes auto-reload."
echo ""
echo "================================================"
echo "  Frontend dev restart complete"
echo "  PID file: $RUN_DIR/librechat-frontend.pid"
echo "================================================"
echo ""

# ----- Backend -----

echo "================================================"
echo "  Restart: LibreChat Backend"
echo "================================================"
echo ""

ensure_insti_root_layout || exit 1

print_step "Pulling latest ($LIBRECHAT_BRANCH)..."
cd "$LIBRECHAT_DIR"
git fetch origin
git pull origin "$LIBRECHAT_BRANCH"
print_status "$(git log -1 --format='%h %s')"
echo ""

fetch_insti_env_from_ssm || exit 1
echo ""

if ! ensure_npm_on_path; then
    print_error "Node.js / npm is not installed or not on PATH."
    print_info "Install: sudo dnf install -y nodejs npm"
    exit 1
fi
print_info "Using $(command -v node) ($(node --version)), $(command -v npm) ($(npm --version))"

if ! librechat_node_version_ok; then
    print_error "Node.js is too old for InstiLibreChat (need 20.19+, 22.12+, or 23+)."
    print_info "NodeSource on OL9: after setup_22.x, if dnf conflicts: sudo dnf remove -y nodejs-full-i18n && sudo dnf install -y nodejs --allowerasing"
    exit 1
fi

print_step "Checking npm dependencies..."
set -o pipefail
npm install --silent 2>&1 | tail -1
print_status "npm dependencies ready"

print_step "Building packages..."
npm run build:packages 2>&1 | tail -3
print_status "All packages built"
set +o pipefail
echo ""

bg_stop_service "librechat-backend" "3080" "LibreChat Backend"

print_step "Checking for any process still on port $LIBRECHAT_BACKEND_PORT..."
PORT_PID=$(ss -tlnp 2>/dev/null | awk -v port=":$LIBRECHAT_BACKEND_PORT " '$0 ~ port {
    match($0, /pid=([0-9]+)/, arr); if (arr[1] != "") print arr[1]
}')

if [ -n "$PORT_PID" ]; then
    print_warning "Process PID $PORT_PID still holding port $LIBRECHAT_BACKEND_PORT — killing it..."
    kill -9 "$PORT_PID" 2>/dev/null && print_status "Killed PID $PORT_PID" || print_error "Failed to kill PID $PORT_PID"
    sleep 1
else
    print_status "Port $LIBRECHAT_BACKEND_PORT is free"
fi
echo ""

mkdir -p "$LIBRECHAT_BACKEND_LOG_DIR"
LIBRECHAT_BACKEND_LOG_FILE="$LIBRECHAT_BACKEND_LOG_DIR/$(date +%Y-%m-%d).log"
touch "$LIBRECHAT_BACKEND_LOG_FILE"
print_info "Logging to: $LIBRECHAT_BACKEND_LOG_FILE"
print_info "MONGO_URI — use InstiLibreChat/.env only (this script does not set or override it)"

NPM_BIN="$(command -v npm)"
if [ -z "$NPM_BIN" ]; then
    print_error "npm not on PATH."
    exit 1
fi

LIBRECHAT_BACKEND_CMD="touch $LIBRECHAT_BACKEND_LOG_FILE; echo \"=== LibreChat backend start \$(date -Is) ===\" | tee -a $LIBRECHAT_BACKEND_LOG_FILE; if command -v stdbuf >/dev/null 2>&1;then stdbuf -oL -eL env PORT=$LIBRECHAT_BACKEND_PORT HOST=0.0.0.0 \"$NPM_BIN\" run backend 2>&1 | tee -a $LIBRECHAT_BACKEND_LOG_FILE; else env PORT=$LIBRECHAT_BACKEND_PORT HOST=0.0.0.0 \"$NPM_BIN\" run backend 2>&1 | tee -a $LIBRECHAT_BACKEND_LOG_FILE; fi"

bg_start_service "librechat-backend" "$LIBRECHAT_DIR" "$LIBRECHAT_BACKEND_CMD" "LibreChat Backend (Port 3080)"

elapsed=0
while [ $elapsed -lt 30 ]; do
    if port_listening 3080; then
        print_status "Backend is listening on port 3080"
        break
    fi
    sleep 2
    elapsed=$((elapsed + 2))
done

if ! port_listening 3080; then
    print_info "Backend not yet on port 3080 (may still be starting)"
    print_info "Check: tail -f $LIBRECHAT_BACKEND_LOG_FILE"
fi

echo ""
echo "================================================"
echo "  Backend restart complete"
echo "================================================"
echo ""
echo "  Log file (daily): $LIBRECHAT_BACKEND_LOG_FILE"
echo "  Follow logs:      tail -f $LIBRECHAT_BACKEND_LOG_FILE"
echo "  PID file:         $RUN_DIR/librechat-backend.pid"
echo ""

# ----- Proxy -----

echo "================================================"
echo "  Restart: insti-proxy"
echo "================================================"
echo ""

ensure_insti_root_layout || exit 1
if [ ! -d "$LIBRECHAT_PROXY_DIR" ]; then
    print_error "Proxy directory missing: $LIBRECHAT_PROXY_DIR"
    exit 1
fi

print_step "Pulling InstiLibreChat ($LIBRECHAT_BRANCH)..."
cd "$LIBRECHAT_DIR"
git fetch origin
git checkout "$LIBRECHAT_BRANCH"
git pull origin "$LIBRECHAT_BRANCH"
print_status "$(git log -1 --format='%h %s')"
echo ""

if ! ensure_go_on_path; then
    print_error "Go is not installed or not on PATH."
    print_info "Install: sudo dnf install golang"
    exit 1
fi
print_info "Using $(command -v go) ($(go version))"

print_step "Downloading proxy Go modules..."
setup_go_private_github_modules
cd "$LIBRECHAT_PROXY_DIR"
go mod download
print_status "Proxy Go modules ready"
echo ""

echo "Stopping existing service..."
bg_stop_service "insti-proxy" "7080" "Proxy"
echo ""
print_info "Ensuring port 7080 is free before start..."
ensure_ports_free 7080
echo ""

echo "Starting service..."
mkdir -p "$INSTI_PROXY_LOG_DIR" "$GO_RUN_TMP"
INSTI_PROXY_LOG_FILE="$INSTI_PROXY_LOG_DIR/$(date +%Y-%m-%d).log"
touch "$INSTI_PROXY_LOG_FILE"
print_info "Logging: $INSTI_PROXY_LOG_FILE"

GO_RUN_PREP="mkdir -p $GO_RUN_TMP && export TMPDIR=$GO_RUN_TMP;"
INSTI_PROXY_CMD="$GO_RUN_PREP touch $INSTI_PROXY_LOG_FILE; echo \"=== insti-proxy start \$(date -Is) ===\" | tee -a $INSTI_PROXY_LOG_FILE; if command -v stdbuf >/dev/null 2>&1; then stdbuf -oL -eL env APP_ENV=prod AWS_REGION=ap-south-1 go run proxymain.go 2>&1 | tee -a $INSTI_PROXY_LOG_FILE; else env APP_ENV=prod AWS_REGION=ap-south-1 go run proxymain.go 2>&1 | tee -a $INSTI_PROXY_LOG_FILE; fi"

bg_start_service "insti-proxy" \
    "$LIBRECHAT_PROXY_DIR" \
    "$INSTI_PROXY_CMD" \
    "Proxy (Port 7080)"

echo ""

print_info "Waiting for service to start..."
sleep 10

if port_listening "7080"; then
    print_status "Proxy is listening on port 7080"
else
    print_warning "Proxy not yet on port 7080 (check: tail -f $INSTI_PROXY_LOG_FILE)"
fi

echo ""
echo "================================================"
echo "  insti-proxy restart complete"
echo "  PID file: $RUN_DIR/insti-proxy.pid"
echo "================================================"
echo ""

# ----- Summary -----

INSTI_DEPLOY_LOG_DATE="$(date +%Y-%m-%d)"
LIBRECHAT_FRONTEND_LOG_FILE="$LIBRECHAT_FRONTEND_LOG_DIR/${INSTI_DEPLOY_LOG_DATE}.log"
LIBRECHAT_BACKEND_LOG_FILE="$LIBRECHAT_BACKEND_LOG_DIR/${INSTI_DEPLOY_LOG_DATE}.log"
INSTI_PROXY_LOG_FILE="$INSTI_PROXY_LOG_DIR/${INSTI_DEPLOY_LOG_DATE}.log"

print_deploy_status

echo "================================================"
echo "  Tail logs (all services)"
echo "================================================"
echo ""
echo "  Frontend (3090)"
echo "    Log file:  $LIBRECHAT_FRONTEND_LOG_FILE"
echo "    Tail -f:   tail -f $LIBRECHAT_FRONTEND_LOG_FILE"
echo ""
echo "  Backend (3080)"
echo "    Log file:  $LIBRECHAT_BACKEND_LOG_FILE"
echo "    Tail -f:   tail -f $LIBRECHAT_BACKEND_LOG_FILE"
echo ""
echo "  Proxy (7080)"
echo "    Log file:  $INSTI_PROXY_LOG_FILE"
echo "    Tail -f:   tail -f $INSTI_PROXY_LOG_FILE"
echo ""
