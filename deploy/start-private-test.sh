#!/usr/bin/env bash
# 只用于已确认的首次私有部署；不修改 SSH、防火墙或其它项目。
set -Eeuo pipefail
umask 077

if [[ "${1:-}" != '--apply' || "$#" != 1 ]]; then
  printf '%s\n' 'Plan: initialize HakiSub configuration, pin Node image, build and start one private container.'
  printf '%s\n' 'Port: server loopback 127.0.0.1:18787 only. No ASR key will be requested.'
  printf '%s\n' 'Run with --apply only after approving these changes.'
  exit 0
fi

step='preflight'
trap 'printf "HakiSub stopped during step: %s. Keep the output; do not delete files or change SSH settings.\n" "$step" >&2' ERR
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
[[ "$root" == '/srv/projects/hakisub' ]] || { printf '%s\n' 'Wrong project directory; stopped.' >&2; exit 1; }
[[ "$(id -un)" == admin ]] || { printf '%s\n' 'Run as admin, without sudo before bash.' >&2; exit 1; }
cd -- "$root"
for file in compose.yaml Dockerfile package-lock.json dist/index.html deploy/release.env deploy/server.env.example; do
  [[ -f "$file" && ! -L "$file" ]] || { printf 'Missing or unsafe deployment file: %s\n' "$file" >&2; exit 1; }
done
for file in .env secrets secrets/server.env; do
  [[ ! -L "$file" ]] || { printf '%s\n' 'Configuration symlink detected; stopped.' >&2; exit 1; }
done
if ! sudo -n docker version --format '{{.Server.Version}}'; then
  printf '%s\n' 'Docker permission check failed. No configuration or container changes were made.' >&2
  printf '%s\n' 'An administrator must confirm Docker access; do not change sudo or SSH configuration automatically.' >&2
  exit 1
fi
sudo -n docker compose version
# 不停止已有容器。此前部署已启动或端口被占用时，交由人工检查。
existing_containers=$(sudo -n docker ps -aq --filter label=com.docker.compose.project=hakisub-test)
[[ -z "$existing_containers" ]] || {
  printf '%s\n' 'HakiSub containers already exist; stopped without changing them.' >&2; exit 1;
}
listeners=$(ss -H -lnt 'sport = :18787')
[[ -z "$listeners" ]] || { printf '%s\n' 'Port 18787 is occupied; stopped.' >&2; exit 1; }

step='configuration'
if [[ ! -e .env ]]; then install -m 600 deploy/release.env .env; fi
if [[ ! -e secrets ]]; then install -d -m 700 secrets; fi
if [[ ! -e secrets/server.env ]]; then install -m 600 deploy/server.env.example secrets/server.env; fi
[[ -f .env && -d secrets && -f secrets/server.env ]] || { printf '%s\n' 'Unexpected configuration paths; stopped.' >&2; exit 1; }
chmod 600 .env secrets/server.env
chmod 700 secrets
# 仅识别非敏感发布值，不 source 配置，不输出环境或完整 Compose 配置。
release=$(sed -n 's/^HAKISUB_RELEASE=//p' .env)
[[ "$release" =~ ^hakisub-[0-9]{8}T[0-9]{6}Z$ ]] || { printf '%s\n' 'Invalid release identifier; stopped.' >&2; exit 1; }
sudo -n docker compose config --quiet

step='base-image'
base=$(sed -n 's/^HAKISUB_NODE_IMAGE=//p' .env)
if [[ "$base" == 'node:22-bookworm-slim' ]]; then
  # docker pull 使用 daemon 已配置的加速器；manifest inspect 会绕过它。
  sudo -n docker info --format 'Configured registry mirrors: {{json .RegistryConfig.Mirrors}}'
  pulled=false
  for attempt in 1 2 3; do
    printf 'Pulling %s, attempt %s/3 (90 second limit).\n' "$base" "$attempt"
    if timeout 90s sudo -n docker pull "$base"; then
      pulled=true
      break
    fi
    if [[ "$attempt" != 3 ]]; then sleep 5; fi
  done
  [[ "$pulled" == true ]] || {
    printf '%s\n' 'Node pull failed after three attempts. Keep the Node version and Docker configuration; prepare an image archive on a build machine instead.' >&2
    exit 1
  }
  digest=$(sudo -n docker image inspect --format '{{index .RepoDigests 0}}' "$base")
  [[ "$digest" =~ ^node@sha256:[a-f0-9]{64}$ ]] || { printf '%s\n' 'Unexpected Node image digest; stopped.' >&2; exit 1; }
  sed -i "s|^HAKISUB_NODE_IMAGE=.*$|HAKISUB_NODE_IMAGE=$digest|" .env
elif [[ ! "$base" =~ ^node@sha256:[a-f0-9]{64}$ ]]; then
  printf '%s\n' 'Unexpected Node base image; stopped.' >&2; exit 1
fi
sudo -n docker compose config --quiet

step='build'
sudo -n docker compose build
sh deploy/prepare-room-storage.sh
step='start'
sudo -n docker compose up -d --no-build
step='health'
healthy=false
for attempt in {1..30}; do
  if curl --fail --silent --max-time 3 http://127.0.0.1:18787/api/asr/health > /dev/null; then
    healthy=true; break
  fi
  sleep 2
done
[[ "$healthy" == true ]] || { printf '%s\n' 'HTTP health check did not pass; inspect HakiSub logs before continuing.' >&2; exit 1; }
sudo -n docker compose ps
curl --fail --silent --show-error --max-time 3 http://127.0.0.1:18787/api/asr/health
printf '\n%s\n' 'HakiSub HTTP check passed. SSH tunnel and real microphone/ASR acceptance are still pending.'
