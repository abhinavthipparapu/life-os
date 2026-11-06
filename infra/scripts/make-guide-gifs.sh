#!/bin/sh
# Records the product guide from the real app and writes GIFs and still images to
# apps/web/public/guide. Stop `pnpm dev` first. Local data only: demo accounts are recreated.
set -eu
OUT=/tmp/lifeos-guide
DEST="$(pwd)/apps/web/public/guide"
rm -rf "$OUT"; mkdir -p "$OUT" "$DEST"

docker compose exec -T postgres psql -U lifeos -d lifeos -qc "DELETE FROM profiles WHERE email LIKE 'demo%@lifeos.local'"
SEED_DEMO_USERS=true pnpm exec tsx --env-file=.env prisma/seed.ts >/dev/null
(set -a; . ./.env; set +a; cd apps/web && pnpm exec playwright test --config=guide/playwright.config.ts)

for clip in signup build template today offline ai insights; do
  start=$(node -p "require('$OUT/trims.json')['$clip']")
  docker run --rm -v "$OUT:/in" -v "$DEST:/out" --entrypoint /bin/sh linuxserver/ffmpeg:latest -c "
    ffmpeg -y -v error -ss $start -i /in/$clip.webm -vf 'fps=9,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle' /out/$clip.gif &&
    ffmpeg -y -v error -sseof -0.4 -i /in/$clip.webm -frames:v 1 -vf 'scale=800:-1' /out/$clip.png"
done
ls -la "$DEST" | awk 'NR>3{printf "%6d KB  %s\n", $5/1024, $9}'
