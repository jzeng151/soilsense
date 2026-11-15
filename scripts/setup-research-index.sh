#!/usr/bin/env bash
# One-time Vectorize setup for cited research (#7). Run from the repo root with a logged-in wrangler.
# Metadata indexes MUST exist before the first upsert: Vectorize only filters vectors upserted after
# the metadata index was created.
set -euo pipefail
INDEX=soilsense-research-v1   # keep in sync with VECTORIZE_INDEX_NAME in src/worker/research/config.ts
npx wrangler vectorize create "$INDEX" --dimensions=768 --metric=cosine
npx wrangler vectorize create-metadata-index "$INDEX" --property-name=crop --type=string
npx wrangler vectorize create-metadata-index "$INDEX" --property-name=corpus --type=string
npx wrangler vectorize list-metadata-index "$INDEX"
echo "Next: npx wrangler deploy, then ADMIN_TOKEN=... node scripts/ingest-research.mjs https://<worker-url>"
