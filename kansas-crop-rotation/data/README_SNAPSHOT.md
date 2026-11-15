# Snapshot data - not live

The files in this folder are a frozen copy from **2026-11-14 23:45 UTC** (NASA data through **2026-11-09**).
They are kept as a record of what was submitted. Nothing in the SoilSense app reads them.

- **Live advice (updated every Monday by the weekly refresh):**
  https://pub-fe3948f31a9c462890b089ed5356c336.r2.dev/app_rotation_advice.json
  The app already uses this link (`src/worker/fieldwatch/sources.ts`, `src/worker/data/kstate.ts`).
- **Live code and data:** https://github.com/vp822-arch/spaceapps2026-kansas-crop-rotation

Always show `data_through` from the live file, not from this folder.
