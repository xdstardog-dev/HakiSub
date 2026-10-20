#!/bin/sh
# 在项目根目录执行；只初始化房间加密主密钥与本项目数据卷，不启动应用。
set -eu
test -f compose.yaml
test -f secrets/server.env
umask 077
mkdir secrets/.room-storage-lock
temporary=''
cleanup() { test -z "$temporary" || rm -f "$temporary"; rmdir secrets/.room-storage-lock; }
trap cleanup EXIT
if ! grep -Eq '^HAKISUB_ROOM_ENCRYPTION_KEY=.+$' secrets/server.env; then
  temporary=$(mktemp secrets/server.env.XXXXXX)
  awk '!/^HAKISUB_ROOM_ENCRYPTION_KEY=/' secrets/server.env > "$temporary"
  room_master_key=$(openssl rand -base64 32)
  printf '\nHAKISUB_ROOM_ENCRYPTION_KEY=%s\n' "$room_master_key" >> "$temporary"
  unset room_master_key
  chmod 600 "$temporary"
  mv "$temporary" secrets/server.env
  temporary=''
fi
release=$(sed -n 's/^HAKISUB_RELEASE=//p' .env)
case "$release" in hakisub-????????T??????Z) ;; *) echo 'Invalid release identifier.' >&2; exit 1 ;; esac
sudo -n docker image inspect "hakisub-test:$release" >/dev/null
sudo -n docker volume create hakisub-test_hakisub_room_data >/dev/null
# 固定数据卷、无网络、只读根目录；只赋予初始化目录权限所需的能力。
sudo -n docker run --rm --pull never --network none --read-only --user 0 --cap-drop ALL --cap-add CHOWN --cap-add FOWNER \
  --mount type=volume,source=hakisub-test_hakisub_room_data,target=/room-data \
  "hakisub-test:$release" sh -ec 'chmod 700 /room-data; chown 1000:1000 /room-data'
printf '%s\n' 'Room storage is ready. Encryption key was not displayed.'
