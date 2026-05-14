#!/bin/bash

# Restart insti-proxy (Go proxy on port 7080).
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
LIBRECHAT_BRANCH="web-insti-integration"
LIBRECHAT_GIT_URL="${LIBRECHAT_GIT_URL:-git@github.com:FyersDev/InstiLibreChat.git}"
INSTI_PROXY_LOG_DIR="$BASE_DIR/logs/insti-proxy"
GO_RUN_TMP="$BASE_DIR/tmp/go-run"

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

pull_librechat_branch() {
    print_step "Pulling latest ($LIBRECHAT_BRANCH)..."
    cd "$LIBRECHAT_DIR"
    git fetch origin
    git checkout "$LIBRECHAT_BRANCH"
    git pull origin "$LIBRECHAT_BRANCH"
    print_status "$(git log -1 --format='%h %s')"
    echo ""
}

setup_go_private_github_modules() {
    export GOPRIVATE="${GOPRIVATE:-github.com/FyersDev/*}"
    export GONOSUMCHECK="${GONOSUMCHECK:-$GOPRIVATE}"
    export GONOPROXY="${GONOPROXY:-$GOPRIVATE}"
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

echo "================================================"
echo "  Restart: insti-proxy"
echo "================================================"
echo ""

ensure_insti_root_layout || exit 1
pull_librechat_branch || exit 1

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

bg_stop_service "insti-proxy" "7080" "Proxy"
echo ""
print_info "Ensuring port 7080 is free before start..."
ensure_ports_free 7080
echo ""

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
echo "  Tail -f:  tail -f $INSTI_PROXY_LOG_FILE"
echo "================================================"
echo ""
