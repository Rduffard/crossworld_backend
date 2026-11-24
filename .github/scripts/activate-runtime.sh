#!/usr/bin/env bash
set -euo pipefail

action="$1"
root="$2"
stage="$3"
cd "$root"
[[ "$stage" == "$root"/.release.* && -d "$stage" ]]
files=(src node_modules package.json package-lock.json)

health() {
  [[ "$(curl -fsS --max-time 3 http://127.0.0.1:3001/healthz)" == OK ]]
}

restore() {
  echo 'Restoring previous backend files and PM2 process.' >&2
  pm2 stop crossworld_backend
  for file in "${files[@]}"; do
    if [[ -e "$stage/previous/$file" ]]; then
      if [[ -e "$file" ]]; then mv "$file" "$stage/failed-$file"; fi
      mv "$stage/previous/$file" "$file"
    fi
  done
  pm2 restart crossworld_backend
  for i in $(seq 1 15); do
    if health; then
      pm2 save
      rm -rf -- "$stage"
      return
    fi
    sleep 2
  done
  echo 'The restored process failed its health check. The staging directory was retained.' >&2
  pm2 status
  return 1
}

case "$action" in
  activate)
    test -s .env
    pm2 describe crossworld_backend >/dev/null
    tar -xzf "$stage/backend-runtime.tgz" -C "$stage"
    node --check "$stage/src/app.js"
    node -e 'require.resolve("express", { paths: [process.argv[1]] })' "$stage"
    mkdir "$stage/previous"
    trap 'status=$?; if [[ "$status" != 0 ]]; then restore; fi; exit "$status"' EXIT
    # Stop first so the old process cannot read partially swapped dependencies.
    pm2 stop crossworld_backend
    for file in "${files[@]}"; do
      mv "$file" "$stage/previous/$file"
      mv "$stage/$file" "$file"
    done
    pm2 restart crossworld_backend
    for i in $(seq 1 15); do
      if health; then exit 0; fi
      sleep 2
    done
    pm2 status
    exit 1
    ;;
  finalize)
    pm2 save
    rm -rf -- "$stage" || echo 'The healthy release is active. Staging cleanup failed.' >&2
    ;;
  restore)
    restore
    ;;
  *)
    exit 2
    ;;
esac
