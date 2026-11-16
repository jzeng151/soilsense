# Operator warming the deployed demo

Read-only investigation found **no `imerg-comparison:` rows in deployed D1**, not merely expired rows. Local warming does not populate deployed D1. No migration or new secret is indicated with the existing ADMIN_TOKEN and EARTHDATA_TOKEN.

**Operator-only remote writes; not executed during this investigation.** Substitute the literal `ADMIN_TOKEN_VALUE` locally, never in a PR/chat. The commands below are templates; apply your normal operator precautions against putting a real secret in shell history/process listings. Each cold field can take minutes. Requests are sequential, bounded to 1800 seconds, with no automatic POST retries. A timeout may retain validated per-day progress; rerun deliberately and still verify the exact public GET.

## Current Field Watch card: Late, exact per-field data-through day

```bash
BASE='https://soilsense-jason.jason-zeng151.workers.dev'
WATCH=$(curl --fail-with-body --silent --show-error --max-time 30 "$BASE/api/fieldwatch/latest") || exit 1
for field in story-ia champaign-il finney-ks lancaster-ne; do
  end=$(printf '%s' "$WATCH" | python -c 'import json,sys; rows=json.load(sys.stdin)["runs"]; day=next(r["dataThrough"] for r in rows if r["fieldId"]==sys.argv[1]); assert day; print(day)' "$field") || exit 1
  curl --fail-with-body --silent --show-error --max-time 1800 --request POST \
    --header 'Authorization: Bearer ADMIN_TOKEN_VALUE' \
    "$BASE/api/imerg/warm/$field?end=$end&stream=late" || exit 1
  printf '\nRead-back %s %s late\n' "$field" "$end"
  curl --fail-with-body --silent --show-error --max-time 30 \
    "$BASE/api/imerg/comparison/$field?end=$end&stream=late" \
    | python -c 'import json,sys; d=json.load(sys.stdin); assert d.get("state")=="available", d; print(json.dumps(d))' || exit 1
done
```

Late expires in one hour. Rewarm before the demo if needed; when Field Watch advances its data-through day, warm that exact new window. Warming the newest NASA day alone may miss the card's requested window. A long-lived Final cache cannot repair a Late card.

## Historical Final demonstration: July 1–14, 2022

After deploying the retention change, new Final metadata, validated days, subsets and comparisons retain for 365 days rather than 30. The adapter supports this historical product/window, but this investigation did not freshly verify its NASA retrieval. Permissions and provider validation still have to succeed.

```bash
BASE='https://soilsense-jason.jason-zeng151.workers.dev'
for field in story-ia champaign-il finney-ks lancaster-ne; do
  curl --fail-with-body --silent --show-error --max-time 1800 --request POST \
    --header 'Authorization: Bearer ADMIN_TOKEN_VALUE' \
    "$BASE/api/imerg/warm/$field?end=2022-07-14&stream=final" || exit 1
  printf '\nRead-back %s 2022-07-14 final\n' "$field"
  curl --fail-with-body --silent --show-error --max-time 30 \
    "$BASE/api/imerg/comparison/$field?end=2022-07-14&stream=final" \
    | python -c 'import json,sys; d=json.load(sys.stdin); assert d.get("state")=="available", d; print(json.dumps(d))' || exit 1
done
```

`available` means a validated comparison bundle exists, not that every day/total is non-null. Inspect fourteen observations and totals; missing or undersampled rain remains unknown. Neither POST success alone nor HTTP 200 unavailable is successful evidence. Final retention is versioned caching, not a promise NASA can never reprocess it. Existing expiry timestamps are not rewritten. POWER LST and IMERG UTC remain non-equivalent intervals; neither changes Field Watch rule v2.
