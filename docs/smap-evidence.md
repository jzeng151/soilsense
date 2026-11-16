# SMAP regional moisture evidence (#20)

## Implemented and live-verified

`GET /api/smap?lat=38.1095&lon=-100.706&year=2022` supplies a **July 1 UTC, one-day observed-state window**, not a growing-season drought score. The pure aggregator supports other within-year windows when samples exist; the checked-in demonstration intentionally covers July 1 only. Other fields remain unavailable, not nearest-county substitutions. R2 `context/smap-v008-finney.json` can override the checked-in bundle after review; malformed overrides fail closed.

- NASA/NSIDC **SPL4SMGP v008**, DOI [10.5067/T5RUATAQREF8](https://doi.org/10.5067/T5RUATAQREF8); [product and citation](https://nsidc.org/data/spl4smgp/versions/8). Product coverage begins 2015-03-31; artifact covers July 1 in each year 2015–2025, eight native 3-hour time averages per day (88 distinct granules).
- Native support: **9 km EASE-Grid 2.0**, EPSG:6933; selected cell row 310, column 849, center 38.0969, -100.69. Requested demo point: 38.1095, -100.706. Surface = 0–5 cm; root zone = 0–100 cm; both **m³/m³**, not relative wetness.
- Attribution: NASA, NSIDC DAAC, SMAP L4 science team. See product DOI for the version-specific recommended author citation. These are assimilated land-model estimates, not independent field sensors. Assimilation can be absent during instrument outages, including July 2019 in this baseline. No assumption of a satellite retrieval every 3 hours.
- [Version 8 specification](https://nsidc.org/data/documentation/spl4smausmgpsmlm-product-specification-document-version-8-2025). L4 geophysical fields do not expose an L2 retrieval quality bitfield. Parser/application QA is recorded explicitly in `qualityPolicy`: finite native moisture 0–0.9, soil layer-1 temperature ≥273.15 K, snow mass =0. **The snow/frozen screen is a conservative demonstration applicability policy, not a NASA quality certification.** It does not verify assimilation diagnostics or all validity criteria. Native `_FillValue` is -9999; rejected/missing values never become zero.

## Seasonal baseline and numerical contract

Match exact UTC month/day slots in each reference year. Require all eight native slots per day; no interpolation, gap filling, missing-as-zero, duplicate selection, leap-day shifting or cross-year windows. Duplicate timestamps invalidate that slot. Means weight equal-duration native slots equally. Each quantity retains its own window mean, sample count and complete-year baseline distribution.

Requested baseline is **2015–2025 with the replay year excluded** (ten complete other July 1 windows for 2022). Both anomalies and empirical percentile ranks require ≥10 complete other years, an explicit **demonstration coverage assumption**, not a climatological normal. A shorter record exposes means/distribution but suppresses anomalies/percentiles. Percentile uses `(number below + half of ties)/N ×100`; anomaly is window mean minus mean of complete reference-year means. There is **no stress cutoff** or confidence verdict. This short SMAP record cannot supply 1991–2025 history or a robust extreme-drought recurrence probability.

Live Earthdata retrieval on 2026-11-15 used Bearer authorization, CMR collection `C3480440870-NSIDC_CPRD`, and OPeNDAP `.ascii` one-cell subsets. Each raw subset URL, granule concept ID and SHA-256 is retained in `data/smap-finney.json`; no token or signed URL is stored. Reproduce with:

```sh
uv pip install requests pyproj
python scripts/smap-point.py --vars-file .dev.vars --output data/smap-finney.json
```

The script discovers real granule filenames, ignores overlapping prior-day granules and downloads ≤88 small point subsets with four concurrent requests. Axes come from NASA, then pyproj selects the nearest EPSG:6933 cell center. Full HDF downloads exceeded the preliminary safety cap, so the delivered reproducible path uses small OPeNDAP responses instead. The optional Worker `/api/smap/catalog` uses `env.EARTHDATA_TOKEN` as an Authorization header; **catalog success is not measurement retrieval**.

Independent Python recomputation and local Wrangler readback agree for 2022 July 1:

| Quantity | Mean | Other-year mean | Anomaly (m³/m³) | Empirical rank |
|---|---:|---:|---:|---:|
| Surface | 0.0704053375 | 0.16860666625 | -0.09820132875 | 0/100 |
| Root zone | 0.173801625 | 0.2246491875 | -0.0508475625 | 0/100 |

0th empirical rank means below these ten historical windows, **not zero moisture or a drought return period**. Vitest includes clearly hand-made coverage/QA/duplicate/early-year/network mocks and separately verifies the real artifact. Field Watch rule v2 and all rotation-ranking code remain unchanged. Observed moisture is never claimed as the hypothetical response of a proposed rotation.

## Deployment checks / scope limitations

No real deployment was performed. After merge/deploy, inspect both quantities, baseline lists and missing-other-field behavior on the Finney demo. Verify the optional Earthdata catalog diagnostic with the configured Cloudflare secret; offline demo evidence does not require runtime credentials. Runtime fresh SMAP monitoring and arbitrary-field acquisition are not implemented. The committed record is a reproducible one-day seasonal demonstration, not daily monitoring, a full season replay or a field measurement.
