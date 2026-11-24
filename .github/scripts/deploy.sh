#!/usr/bin/env bash
set -euo pipefail

target="$DEPLOY_USER@$DEPLOY_HOST"
root=/home/iroamm/crossworld_backend
stage=$(ssh "$target" "mktemp -d '$root/.release.XXXXXXXX'")
scp "$1/backend-runtime.tgz" .github/scripts/activate-runtime.sh "$target:$stage/"

ssh "$target" bash "$stage/activate-runtime.sh" activate "$root" "$stage"
health=https://api.crossworldcreative.com/healthz
if [[ "$(curl -fsS --retry 3 --max-time 15 "$health")" == OK ]] &&
  [[ "$(curl -sS --max-time 15 --output /dev/null --write-out '%{http_code}' https://api.crossworldcreative.com/operations/hosts)" == 401 ]] &&
  ssh "$target" bash "$stage/activate-runtime.sh" finalize "$root" "$stage"; then
  exit 0
fi

echo "::error::Backend health check, Operations authentication check, or PM2 save failed. Restoring the previous runtime."
ssh "$target" bash "$stage/activate-runtime.sh" restore "$root" "$stage"
exit 1
