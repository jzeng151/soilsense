# Bundled reference snapshot - not live

The files in this folder are a bundled reference snapshot of the Kansas crop rotation pipeline's outputs.

- `app_rotation_advice.json` was generated at **2026-11-14 23:45 UTC**.
- Its NASA POWER data runs through **2026-11-09**. That is the POWER cutoff only, not every source's date:
  the U.S. Drought Monitor data in this folder runs to **2026-11-10**.

**How the app uses it.** The app normally reads the published R2 advice; Second Opinion uses this bundled
snapshot as a labelled fallback when the live request fails (`src/worker/data/kstate.ts` imports
`app_rotation_advice.json` from this folder). Field Watch reads the published R2 advice
(`src/worker/fieldwatch/sources.ts`).

- **Published advice (R2):** https://pub-fe3948f31a9c462890b089ed5356c336.r2.dev/app_rotation_advice.json
  A refresh is scheduled for Mondays. The published file only changes when that refresh succeeds, so it
  can be older than the latest Monday.
- **Upstream code and data:** https://github.com/vp822-arch/spaceapps2026-kansas-crop-rotation

**Which date to show.** Show the `data_through` and `generated` values of whichever file was actually
served (live or bundled), together with its label. Do not assume the live file was the one served.
