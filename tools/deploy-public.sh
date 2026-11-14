#!/usr/bin/env bash
set -euo pipefail

case "${1:-}" in
  "") deploy_options=() ;;
  --dry-run) deploy_options=(--dry-run) ;;
  *) echo "Usage: bash tools/deploy-public.sh [--dry-run]" >&2; exit 2 ;;
esac
if (( $# > 1 )); then
  echo "Usage: bash tools/deploy-public.sh [--dry-run]" >&2
  exit 2
fi

cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
npm run build:publish

# A complete build is required before rsync can remove obsolete remote files.
test -s dist/index.html
test -s dist/author/index.html
test -s dist/author/play.html

rsync -av --delete -e "ssh -o BatchMode=yes -o ConnectTimeout=10" "${deploy_options[@]}" dist/ holger@buening.eu:/var/www/html/
if (( ${#deploy_options[@]} )); then
  echo "Deployment preview complete; no server files were changed."
else
  echo "Game: https://www.buening.eu/"
  echo "Author Studio: https://www.buening.eu/author/"
fi
