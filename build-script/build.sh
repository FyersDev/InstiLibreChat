#!/bin/bash

# Full InstiLibreChat deploy: frontend (production static build served by backend), backend, and insti-proxy.
# Self-contained — no sourcing of other shell scripts.

set -e

if [ -z "${BASH_VERSION:-}" ]; then
    exec bash "$0" "$@"
fi

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
LIBRECHAT_BRANCH="cug"
LIBRECHAT_GIT_URL="${LIBRECHAT_GIT_URL:-git@github.com:FyersDev/fy_insti_libre_chat.git}"
LIBRECHAT_BACKEND_LOG_DIR="$BASE_DIR/logs/librechat-backend"
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

port_listening() { ss -tln 2>/dev/null | grep -qE ":$1([[:space:]]|$)"; }

print_log_tail() {
    local log_file="$1"
    local lines="${2:-40}"

    if [ ! -s "$log_file" ]; then
        return 0
    fi

    echo ""
    print_info "Last $lines lines of $log_file:"
    tail -n "$lines" "$log_file"
    echo ""
}

wait_for_service() {
    local port="$1"
    local label="$2"
    local timeout="${3:-60}"
    local service_name="${4:-}"
    local log_file="${5:-}"
    local elapsed=0
    local pid

    while [ "$elapsed" -lt "$timeout" ]; do
        if [ -n "$service_name" ] && [ -f "$RUN_DIR/${service_name}.pid" ]; then
            pid="$(tr -d '[:space:]' <"$RUN_DIR/${service_name}.pid" 2>/dev/null || true)"
            if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
                print_error "$label exited before port $port was ready"
                print_log_tail "$log_file"
                return 1
            fi
        fi
        if port_listening "$port"; then
            print_status "$label is listening on port $port"
            return 0
        fi
        sleep 2
        elapsed=$((elapsed + 2))
    done

    print_warning "$label not yet on port $port after ${timeout}s"
    print_log_tail "$log_file"
    return 1
}

ensure_local_mongo_if_needed() {
    local env_file="$LIBRECHAT_DIR/.env"

    if [ ! -f "$env_file" ]; then
        return 0
    fi
    if ! grep -Eq '^MONGO_URI=.*(localhost|127\.0\.0\.1):27017' "$env_file"; then
        print_info "MONGO_URI does not target localhost:27017 — skipping local MongoDB port check"
        return 0
    fi

    print_step "Checking local MongoDB on port 27017..."
    if port_listening 27017; then
        print_status "MongoDB is listening on port 27017"
        return 0
    fi

    if command -v docker >/dev/null 2>&1; then
        if docker ps --format '{{.Names}}' | grep -qx 'chat-mongodb'; then
            print_warning "chat-mongodb is running but port 27017 is not reachable on this host; confirm MONGO_URI"
            return 0
        fi
        if [ -f "$LIBRECHAT_DIR/docker-compose.yml" ]; then
            print_step "Starting MongoDB (docker compose mongodb)..."
            if (cd "$LIBRECHAT_DIR" && docker compose up -d mongodb); then
                sleep 3
                if port_listening 27017; then
                    print_status "MongoDB is listening on port 27017"
                    return 0
                fi
            fi
        fi
    fi

    print_warning "Local MongoDB is not reachable on port 27017; backend may exit until Mongo is available"
    return 0
}

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

install_nodejs_npm_via_dnf() {
    if ! command -v dnf >/dev/null 2>&1; then
        return 1
    fi
    print_step "Installing Node.js and npm (sudo dnf install -y nodejs npm)..."
    sudo dnf install -y nodejs npm
}

# NodeSource 22.x meets InstiLibreChat (20.19+, 22.12+, or 23+). OL9 may need nodejs-full-i18n removed.
NODESETUP_22_URL="${NODESETUP_22_URL:-https://rpm.nodesource.com/setup_22.x}"

upgrade_nodejs_via_nodesource_22_dnf() {
    if ! command -v dnf >/dev/null 2>&1; then
        return 1
    fi

    if ! command -v curl >/dev/null 2>&1; then
        print_step "Installing curl (needed for NodeSource setup)..."
        sudo dnf install -y curl || return 1
    fi

    print_step "NodeSource: registering Node.js 22.x repo ($NODESETUP_22_URL)..."
    if ! curl -fsSL "$NODESETUP_22_URL" | sudo bash -; then
        print_warning "NodeSource setup script failed"
        return 1
    fi

    if sudo dnf install -y nodejs; then
        return 0
    fi

    print_warning "dnf install nodejs failed — OL9-style retry (remove nodejs-full-i18n, install with --allowerasing)..."
    sudo dnf remove -y nodejs-full-i18n 2>/dev/null || true
    sudo dnf install -y nodejs --allowerasing
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

install_golang_via_dnf() {
    if ! command -v dnf >/dev/null 2>&1; then
        return 1
    fi
    print_step "Installing Go (sudo dnf install -y golang)..."
    sudo dnf install -y golang
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
        print_warning "AWS CLI not found — attempting install via pip3..."
        if command -v pip3 >/dev/null 2>&1; then
            pip3 install --quiet awscli && hash -r 2>/dev/null || true
        fi
    fi
    if ! command -v aws >/dev/null 2>&1; then
        print_warning "pip3 unavailable — attempting curl install..."
        if command -v curl >/dev/null 2>&1 && command -v unzip >/dev/null 2>&1; then
            curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip \
                && unzip -q /tmp/awscliv2.zip -d /tmp/awscliv2 \
                && sudo /tmp/awscliv2/aws/install \
                && rm -rf /tmp/awscliv2.zip /tmp/awscliv2 \
                && hash -r 2>/dev/null || true
        fi
    fi
    if ! command -v aws >/dev/null 2>&1; then
        print_error "AWS CLI is not installed and could not be auto-installed."
        print_info "Manual fix: curl https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip -o awscliv2.zip && unzip awscliv2.zip && sudo ./aws/install"
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

apply_librechat_config() {
    local example="$LIBRECHAT_DIR/librechat.example.yaml"
    local target="$LIBRECHAT_DIR/librechat.yaml"
    if [ ! -f "$example" ]; then
        print_error "Missing $example"
        return 1
    fi
    print_step "Applying librechat.example.yaml → librechat.yaml..."
    cp -f "$example" "$target"
    print_status "Wrote $target"
}

validate_librechat_config() {
    local target="$LIBRECHAT_DIR/librechat.yaml"

    print_step "Validating librechat.yaml..."
    if ! (cd "$LIBRECHAT_DIR/api" && node -e "const fs=require('fs'); const yaml=require('js-yaml'); yaml.load(fs.readFileSync(process.argv[1],'utf8'));" "$target"); then
        print_error "Invalid librechat.yaml (check librechat.example.yaml)"
        return 1
    fi
    print_status "librechat.yaml is valid YAML"
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
    local spec service_name port friendly_name pid_file pid port_state proc_state

    echo "================================================"
    echo "  Service status"
    echo "  $(date '+%Y-%m-%d %H:%M:%S')"
    echo "================================================"
    echo ""

    for spec in \
        "librechat-backend:3080:Backend" \
        "insti-proxy:7080:Proxy"; do
        IFS=: read -r service_name port friendly_name <<< "$spec"
        pid_file="$RUN_DIR/${service_name}.pid"
        pid="—"
        proc_state="stopped"
        if [ -f "$pid_file" ]; then
            pid="$(tr -d '[:space:]' <"$pid_file" 2>/dev/null || true)"
            [ -z "$pid" ] && pid="—"
            if [ "$pid" != "—" ] && kill -0 "$pid" 2>/dev/null; then
                proc_state="running"
            fi
        fi
        if port_listening "$port"; then
            port_state="listening"
        else
            port_state="not listening"
        fi
        echo "  $friendly_name ($port): $port_state | process $proc_state | PID file: $pid_file | PID: $pid"
    done
    echo ""
}

# ----- Prepare repo & build -----

echo "================================================"
echo "  InstiLibreChat deploy"
echo "================================================"
echo ""

if ! command -v git >/dev/null 2>&1; then
    print_warning "git not found — attempting dnf install..."
    sudo dnf install -y git || true
fi
if ! command -v git >/dev/null 2>&1; then
    print_error "git is required but could not be installed. Run: sudo dnf install -y git"
    exit 1
fi

ensure_insti_root_layout || exit 1

print_step "Pulling latest ($LIBRECHAT_BRANCH)..."
cd "$LIBRECHAT_DIR"
git fetch origin
git checkout "$LIBRECHAT_BRANCH"
git pull origin "$LIBRECHAT_BRANCH"
print_status "$(git log -1 --format='%h %s')"
echo ""

apply_librechat_config || exit 1
fetch_insti_env_from_ssm || exit 1
echo ""

if ! ensure_npm_on_path; then
    print_warning "Node.js / npm not on PATH — attempting dnf install..."
    if install_nodejs_npm_via_dnf; then
        hash -r 2>/dev/null || true
    fi
fi
if ! ensure_npm_on_path; then
    print_error "Node.js / npm is not installed or not on PATH."
    print_info "Install: sudo dnf install -y nodejs npm"
    exit 1
fi
print_info "Using $(command -v node) ($(node --version)), $(command -v npm) ($(npm --version))"

if ! librechat_node_version_ok; then
    print_warning "Node.js is too old for InstiLibreChat (need 20.19+, 22.12+, or 23+) — attempting NodeSource 22.x..."
    if upgrade_nodejs_via_nodesource_22_dnf; then
        hash -r 2>/dev/null || true
    fi
fi
if ! librechat_node_version_ok; then
    print_error "Node.js is too old for InstiLibreChat (need 20.19+, 22.12+, or 23+)."
    print_info "Manual fix (dnf): curl -fsSL $NODESETUP_22_URL | sudo bash - && sudo dnf install -y nodejs"
    print_info "If dnf conflicts on OL9: sudo dnf remove -y nodejs-full-i18n && sudo dnf install -y nodejs --allowerasing"
    exit 1
fi

print_step "Checking npm dependencies..."
set -o pipefail
npm install --silent 2>&1 | tail -1
print_status "npm dependencies ready"

validate_librechat_config || exit 1
echo ""

print_step "Building packages..."
npm run build:packages 2>&1 | tail -3
print_status "All packages built"

print_step "Cleaning previous client bundle..."
rm -rf "$LIBRECHAT_DIR/client/dist"
print_status "client/dist/ cleared"

print_step "Building client production bundle (required by backend)..."
npm run build:client 2>&1 | tail -5
if [ ! -f "$LIBRECHAT_DIR/client/dist/index.html" ]; then
    print_error "Missing $LIBRECHAT_DIR/client/dist/index.html after build:client"
    exit 1
fi
print_status "Client production bundle ready"
set +o pipefail
echo ""

NPM_BIN="$(command -v npm)"
if [ -z "$NPM_BIN" ]; then
    print_error "npm not on PATH."
    exit 1
fi

# ----- Frontend -----
# The production bundle was built above (client/dist/). The backend serves it as
# static files at /research/ when NODE_ENV=production — no separate frontend
# process is needed. Stop any lingering Vite dev server from a previous deploy.

bg_stop_service "librechat-frontend" "3090" "LibreChat Frontend (legacy dev server)"
print_status "Frontend: static files in client/dist/ — served by backend on port $LIBRECHAT_BACKEND_PORT"
echo ""

# ----- Backend -----

echo "================================================"
echo "  Restart: LibreChat Backend"
echo "================================================"
echo ""

bg_stop_service "librechat-backend" "3080" "LibreChat Backend"

ensure_local_mongo_if_needed
echo ""

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

LIBRECHAT_BACKEND_CMD="touch $LIBRECHAT_BACKEND_LOG_FILE; echo \"=== LibreChat backend start \$(date -Is) ===\" | tee -a $LIBRECHAT_BACKEND_LOG_FILE; if command -v stdbuf >/dev/null 2>&1;then stdbuf -oL -eL env PORT=$LIBRECHAT_BACKEND_PORT HOST=0.0.0.0 \"$NPM_BIN\" run backend 2>&1 | tee -a $LIBRECHAT_BACKEND_LOG_FILE; else env PORT=$LIBRECHAT_BACKEND_PORT HOST=0.0.0.0 \"$NPM_BIN\" run backend 2>&1 | tee -a $LIBRECHAT_BACKEND_LOG_FILE; fi"

bg_start_service "librechat-backend" "$LIBRECHAT_DIR" "$LIBRECHAT_BACKEND_CMD" "LibreChat Backend (Port 3080)"

if ! wait_for_service 3080 "LibreChat Backend" 120 "librechat-backend" "$LIBRECHAT_BACKEND_LOG_FILE"; then
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

if [ ! -d "$LIBRECHAT_PROXY_DIR" ]; then
    print_error "Proxy directory missing: $LIBRECHAT_PROXY_DIR"
    exit 1
fi

if ! ensure_go_on_path; then
    print_warning "Go is not on PATH — attempting dnf install..."
    if install_golang_via_dnf; then
        hash -r 2>/dev/null || true
    fi
fi
if ! ensure_go_on_path; then
    print_error "Go is not installed or not on PATH."
    print_info "Install: sudo dnf install -y golang"
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

if ! wait_for_service 7080 "Proxy" 60 "insti-proxy" "$INSTI_PROXY_LOG_FILE"; then
    print_info "Check: tail -f $INSTI_PROXY_LOG_FILE"
fi

echo ""
echo "================================================"
echo "  insti-proxy restart complete"
echo "  PID file: $RUN_DIR/insti-proxy.pid"
echo "================================================"
echo ""

# ----- Summary -----

INSTI_DEPLOY_LOG_DATE="$(date +%Y-%m-%d)"
LIBRECHAT_BACKEND_LOG_FILE="$LIBRECHAT_BACKEND_LOG_DIR/${INSTI_DEPLOY_LOG_DATE}.log"
INSTI_PROXY_LOG_FILE="$INSTI_PROXY_LOG_DIR/${INSTI_DEPLOY_LOG_DATE}.log"

print_deploy_status

echo "  Status all: for s in librechat-backend:3080 insti-proxy:7080; do IFS=: read -r n p <<< \"\$s\"; st=not\\ listening; ss -tln 2>/dev/null | grep -qE \":\$p([[:space:]]|\$)\" && st=listening; pid=—; proc=stopped; [ -f $RUN_DIR/\${n}.pid ] && pid=\$(tr -d '[:space:]' < $RUN_DIR/\${n}.pid); [ \"\$pid\" != \"—\" ] && kill -0 \"\$pid\" 2>/dev/null && proc=running; printf '%s (%s): %s process=%s PID=%s\\n' \"\$n\" \"\$p\" \"\$st\" \"\$proc\" \"\$pid\"; done"
echo ""

echo "================================================"
echo "  Tail logs (all services)"
echo "================================================"
echo ""
echo "  Backend (3080)"
echo "    Log file:  $LIBRECHAT_BACKEND_LOG_FILE"
echo "    Tail -f:   tail -f $LIBRECHAT_BACKEND_LOG_FILE"
echo ""
echo "  Proxy (7080)"
echo "    Log file:  $INSTI_PROXY_LOG_FILE"
echo "    Tail -f:   tail -f $INSTI_PROXY_LOG_FILE"
echo ""
