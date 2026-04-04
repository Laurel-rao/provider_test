#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env}"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  source "${ENV_FILE}"
  set +a
fi

HOST="${HOST:-${DEPLOY_HOST:-}}"
REMOTE_DIR="${REMOTE_DIR:-${DEPLOY_REMOTE_DIR:-/opt/api_monitor}}"
BRANCH="${BRANCH:-${DEPLOY_BRANCH:-main}}"
COMPOSE_FILE="${COMPOSE_FILE:-${DEPLOY_COMPOSE_FILE:-docker-compose.yml}}"
SYNC_ENV_MODE="${SYNC_ENV_MODE:-${DEPLOY_SYNC_ENV_MODE:-auto}}"
DOCKER_REGISTRY_MIRROR="${DOCKER_REGISTRY_MIRROR:-${DEPLOY_DOCKER_REGISTRY_MIRROR:-https://docker.1panel.live}}"
DEPLOY_MODE="${DEPLOY_MODE:-${DEPLOY_DEPLOY_MODE:-restart}}"
REMOTE_UPDATE_MODE="${REMOTE_UPDATE_MODE:-${DEPLOY_REMOTE_UPDATE_MODE:-auto}}"
GIT_REMOTE_URL="${GIT_REMOTE_URL:-${DEPLOY_GIT_REMOTE_URL:-}}"
BUILD_FRONTEND="${BUILD_FRONTEND:-${DEPLOY_BUILD_FRONTEND:-always}}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) HOST="$2"; shift 2 ;;
    --dir) REMOTE_DIR="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    --compose-file) COMPOSE_FILE="$2"; shift 2 ;;
    --sync-env) SYNC_ENV_MODE="always"; shift 1 ;;
    --no-sync-env) SYNC_ENV_MODE="never"; shift 1 ;;
    --registry-mirror) DOCKER_REGISTRY_MIRROR="$2"; shift 2 ;;
    --rebuild) DEPLOY_MODE="rebuild"; shift 1 ;;
    --restart-only) DEPLOY_MODE="restart"; shift 1 ;;
    --remote-git) REMOTE_UPDATE_MODE="git"; shift 1 ;;
    --remote-rsync) REMOTE_UPDATE_MODE="rsync"; shift 1 ;;
    --git-url) GIT_REMOTE_URL="$2"; shift 2 ;;
    --build-frontend) BUILD_FRONTEND="always"; shift 1 ;;
    --no-build-frontend) BUILD_FRONTEND="never"; shift 1 ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

DOCKER_REGISTRY_MIRROR="$(printf '%s' "${DOCKER_REGISTRY_MIRROR}" | tr -d '\140[:space:]')"
GIT_REMOTE_URL="$(printf '%s' "${GIT_REMOTE_URL}" | tr -d '\140[:space:]')"
BUILD_FRONTEND="$(printf '%s' "${BUILD_FRONTEND}" | tr -d '\140[:space:]')"

if [[ -z "${HOST}" ]]; then
  echo "Missing deploy host. Set DEPLOY_HOST in .env or HOST in environment." >&2
  exit 2
fi

if [[ -z "${DOCKER_REGISTRY_MIRROR}" || "${DOCKER_REGISTRY_MIRROR}" != https://* ]]; then
  echo "Invalid docker registry mirror: ${DOCKER_REGISTRY_MIRROR}" >&2
  exit 2
fi

if [[ "${REMOTE_UPDATE_MODE}" != "auto" && "${REMOTE_UPDATE_MODE}" != "git" && "${REMOTE_UPDATE_MODE}" != "rsync" ]]; then
  echo "Invalid REMOTE_UPDATE_MODE: ${REMOTE_UPDATE_MODE} (expected auto|git|rsync)" >&2
  exit 2
fi

if [[ "${BUILD_FRONTEND}" != "always" && "${BUILD_FRONTEND}" != "never" ]]; then
  echo "Invalid BUILD_FRONTEND: ${BUILD_FRONTEND} (expected always|never)" >&2
  exit 2
fi

if [[ -z "${GIT_REMOTE_URL}" && -d "${ROOT_DIR}/.git" ]] && command -v git >/dev/null 2>&1; then
  if GIT_REMOTE_URL="$(git -C "${ROOT_DIR}" config --get remote.origin.url 2>/dev/null || true)"; then
    GIT_REMOTE_URL="$(printf '%s' "${GIT_REMOTE_URL}" | tr -d '\140[:space:]')"
  fi
fi

echo "Deploying to ${HOST}:${REMOTE_DIR}"

ssh "${HOST}" "mkdir -p '${REMOTE_DIR}'"

REMOTE_HAS_GIT_REPO=0
if ssh "${HOST}" "command -v git >/dev/null 2>&1 && test -d '${REMOTE_DIR}/.git'"; then
  REMOTE_HAS_GIT_REPO=1
fi

REMOTE_DIR_EMPTY=0
if ssh "${HOST}" "test -z \"\$(ls -A '${REMOTE_DIR}' 2>/dev/null || true)\""; then
  REMOTE_DIR_EMPTY=1
fi

EFFECTIVE_UPDATE_MODE="${REMOTE_UPDATE_MODE}"
if [[ "${EFFECTIVE_UPDATE_MODE}" == "auto" ]]; then
  if [[ "${REMOTE_HAS_GIT_REPO}" -eq 1 ]]; then
    EFFECTIVE_UPDATE_MODE="git"
  elif [[ "${REMOTE_DIR_EMPTY}" -eq 1 && -n "${GIT_REMOTE_URL}" ]]; then
    EFFECTIVE_UPDATE_MODE="git"
  else
    EFFECTIVE_UPDATE_MODE="rsync"
  fi
fi

if [[ "${BUILD_FRONTEND}" == "always" ]]; then
  if ! command -v npm >/dev/null 2>&1; then
    echo "npm not found locally, cannot build ui/dist" >&2
    exit 1
  fi

  if [[ ! -d "${ROOT_DIR}/ui/node_modules" ]]; then
    npm -C "${ROOT_DIR}/ui" ci
  fi

  npm -C "${ROOT_DIR}/ui" run build
fi

if [[ "${EFFECTIVE_UPDATE_MODE}" == "rsync" ]]; then
  rsync -az --delete \
    --exclude ".git/" \
    --exclude ".DS_Store" \
    --exclude ".env" \
    --exclude "backend/.venv/" \
    --exclude "**/__pycache__/" \
    --exclude "**/.pytest_cache/" \
    "${ROOT_DIR}/" "${HOST}:${REMOTE_DIR}/"
fi

if [[ "${EFFECTIVE_UPDATE_MODE}" == "git" ]]; then
  ssh "${HOST}" bash -s -- "${REMOTE_DIR}" "${BRANCH}" "${GIT_REMOTE_URL}" <<'EOF'
set -euo pipefail

REMOTE_DIR="$1"
BRANCH="$2"
GIT_REMOTE_URL="${3:-}"

cd "${REMOTE_DIR}"

if ! command -v git >/dev/null 2>&1; then
  echo "git not found on remote, falling back to current files" >&2
elif [ -d .git ]; then
  git fetch --all --prune
  git checkout "${BRANCH}"
  if git show-ref --verify --quiet "refs/remotes/origin/${BRANCH}"; then
    git reset --hard "origin/${BRANCH}"
  else
    git pull --ff-only
  fi
  git clean -fd -e .env
elif [ -n "${GIT_REMOTE_URL}" ] && [ -z "$(ls -A . 2>/dev/null || true)" ]; then
  git clone --depth 1 --branch "${BRANCH}" "${GIT_REMOTE_URL}" .
else
  echo "remote is not a git repo; using existing files in ${REMOTE_DIR}" >&2
fi
EOF

  if [[ "${BUILD_FRONTEND}" == "always" ]]; then
    ssh "${HOST}" "mkdir -p '${REMOTE_DIR}/ui/dist'"
    rsync -az --delete "${ROOT_DIR}/ui/dist/" "${HOST}:${REMOTE_DIR}/ui/dist/"
  fi
fi

REMOTE_ENV_EXISTS=0
if ssh "${HOST}" "test -f '${REMOTE_DIR}/.env'"; then
  REMOTE_ENV_EXISTS=1
fi

if [[ "${SYNC_ENV_MODE}" == "always" || ( "${SYNC_ENV_MODE}" == "auto" && "${REMOTE_ENV_EXISTS}" -eq 0 ) ]]; then
  if [[ -f "${ROOT_DIR}/.env" ]]; then
    rsync -az "${ROOT_DIR}/.env" "${HOST}:${REMOTE_DIR}/.env"
  elif [[ -f "${ROOT_DIR}/.env.example" ]]; then
    rsync -az "${ROOT_DIR}/.env.example" "${HOST}:${REMOTE_DIR}/.env"
  fi
fi

ssh "${HOST}" bash -s -- "${REMOTE_DIR}" "${COMPOSE_FILE}" "${DOCKER_REGISTRY_MIRROR}" "${DEPLOY_MODE}" "${BUILD_FRONTEND}" <<'EOF'
set -euo pipefail

REMOTE_DIR="$1"
COMPOSE_FILE="$2"
DOCKER_REGISTRY_MIRROR="$3"
DEPLOY_MODE="$4"
BUILD_FRONTEND="${5:-always}"

cd "${REMOTE_DIR}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found" >&2
  exit 1
fi

mkdir -p /etc/docker
DOCKER_DAEMON_TMP="$(mktemp)"
cat > "${DOCKER_DAEMON_TMP}" <<JSON
{
  "registry-mirrors": [
    "${DOCKER_REGISTRY_MIRROR}",
    "https://docker.xuanyuan.me",
    "https://docker.m.daocloud.io"
  ]
}
JSON

DOCKER_DAEMON_CHANGED=1
if [ -f /etc/docker/daemon.json ] && cmp -s "${DOCKER_DAEMON_TMP}" /etc/docker/daemon.json; then
  DOCKER_DAEMON_CHANGED=0
fi

if [ "${DOCKER_DAEMON_CHANGED}" = "1" ]; then
  if [ -f /etc/docker/daemon.json ]; then
    cp /etc/docker/daemon.json "/etc/docker/daemon.json.bak.$(date +%Y%m%d%H%M%S)"
  fi
  mv "${DOCKER_DAEMON_TMP}" /etc/docker/daemon.json

  if command -v systemctl >/dev/null 2>&1; then
    systemctl restart docker
  elif command -v service >/dev/null 2>&1; then
    service docker restart
  else
    echo "cannot restart docker automatically" >&2
    exit 1
  fi
else
  rm -f "${DOCKER_DAEMON_TMP}"
fi

for _ in 1 2 3 4 5; do
  if docker info >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
docker info >/dev/null

if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  echo "docker compose not found" >&2
  exit 1
fi

if [ ! -f .env ]; then
  echo ".env not found in ${REMOTE_DIR}" >&2
  exit 1
fi

if [ "${DEPLOY_MODE}" = "rebuild" ]; then
  $COMPOSE -f "${COMPOSE_FILE}" pull || true
  $COMPOSE -f "${COMPOSE_FILE}" up -d --build
else
  $COMPOSE -f "${COMPOSE_FILE}" up -d mysql
  MYSQL_CONTAINER_ID="$($COMPOSE -f "${COMPOSE_FILE}" ps -q mysql)"
  if [ -n "${MYSQL_CONTAINER_ID}" ]; then
    for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
      if [ "$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${MYSQL_CONTAINER_ID}")" = "healthy" ]; then
        break
      fi
      sleep 2
    done
  fi
  $COMPOSE -f "${COMPOSE_FILE}" build backend
  if [ "${BUILD_FRONTEND}" = "always" ]; then
    $COMPOSE -f "${COMPOSE_FILE}" build frontend
  fi
  $COMPOSE -f "${COMPOSE_FILE}" up -d backend frontend
fi
$COMPOSE -f "${COMPOSE_FILE}" ps
EOF
