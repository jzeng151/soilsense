# Wind fixtures (issues #17, #40)

Real, unmodified responses retrieved 2026-11-14.

| File | Request |
|---|---|
| `power-wind-finney-2021-2025.json` | `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=WS10M,WS10M_MAX&community=AG&latitude=38&longitude=-100.625&start=20210101&end=20251231&format=JSON&time-standard=LST` (POWER API v2.10.3; MERRA-2 grid cell for the Finney County demo farm) |
| `sda-wind-finney.json` | Soil Data Access `post.rest`, `windSoilQuery(38.1095, -100.706)` from `src/worker/data/soilWind.ts` |
| `sda-wind-story.json` | Soil Data Access `post.rest`, `windSoilQuery(42.0563, -93.495)` |

Parameter definitions were checked against
`https://power.larc.nasa.gov/api/system/manager/parameters?community=AG&temporal=daily` (WS10M_MAX: "The maximum hourly
wind speed at 10 meters above the surface of the earth in the period of interest.", m/s).
