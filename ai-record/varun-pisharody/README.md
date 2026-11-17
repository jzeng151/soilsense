# AI record: Varun Pisharody (Kansas crop rotation pipeline)

**This folder covers Varun Pisharody's part of SoilSense only:** the Kansas crop rotation pipeline in
`kansas-crop-rotation/` and its documentation. It does not cover the rest of the SoilSense app (web dashboard, phone
line, engine in `src/`), whose authors keep their own records.

**The logs are a historical / upstream record, not a description of current SoilSense behaviour.** They were written
while the work happened. Some entries describe Varun's newer upstream repository or earlier states of features such as
Field Watch. For current behaviour, read the code and README on the branch being judged.

AI tool used: Claude (Anthropic), models Claude Fable 5.2 (`claude-fable-5-2`) and Claude Opus 5.5
(`claude-opus-5-5`), Nov 14–15, 2026.

| File | What it is |
|---|---|
| [AI_USE_STATEMENT.md](AI_USE_STATEMENT.md) | Summary: scope, what the AI did, what Varun checked, limits, credentials |
| [AI-activity-log-part1.md](AI-activity-log-part1.md) | Timestamped log, entries 1–32 (Nov 14 morning to ~14:20) |
| [AI-activity-log-part2.md](AI-activity-log-part2.md) | Timestamped log, entries 33–74 (snapshot of Nov 15, 2026) |

Later entries are in the upstream repository:
https://github.com/vp822-arch/spaceapps2026-kansas-crop-rotation/tree/main/ai-record

Every script in `kansas-crop-rotation/scripts/` is labelled in its header as written by Claude (Anthropic AI).

## Corrections

These correct statements made in the logs. The original entries are kept, with a correction note beside them.

1. **AI rules (part 1, entry 23).** The entry said no AI-specific Space Apps rule was found. That was incomplete: it
   was based only on the Participant Terms page. The requirements are summarised in
   [docs/SUBMISSION.md](../../docs/SUBMISSION.md): AI-generated code and data must be acknowledged in descriptive
   text and in metadata, and AI-generated images and video need a visible watermark.
2. **Drought target (part 2, entry 33).** The entry said "at least 50% of the district in D1 or worse". More exactly,
   the target is whether the unweighted mean of the counties' D1-or-worse percentages is at least 50, within an
   approximate district grouping (each county assigned to the nearest of nine points). It is not area-weighted and
   the groups are not official NASS districts. See `kansas-crop-rotation/scripts/09_usdm_labels.py`.
3. **Credentials.** An earlier version of the statement said Claude never saw any password or key. The logs record
   two exposures (a pasted Earthdata token and a password visible in a screenshot); the statement now says so. No
   values are in this record.

## Removed from this public copy

Device and hostname details, a database service identifier, a travel itinerary, and one filename that contained the
first characters of a token.
