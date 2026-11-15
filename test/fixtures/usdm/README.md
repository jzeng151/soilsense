# USDM fixtures (issue #31)

Real, unmodified responses from the U.S. Drought Monitor data services REST API (county statistics,
`statisticsType=2` = categorical / exclusive % of county area, `Accept: application/json`), retrieved 2026-11-14.

| File | Request |
|---|---|
| `finney-20055-2022-may-sep.json` | `https://usdmdataservices.unl.edu/api/CountyStatistics/GetDroughtSeverityStatisticsByAreaPercent?aoi=20055&startdate=5/1/2022&enddate=9/30/2022&statisticsType=2` |
| `county-17019-2022-07-12.json` | same endpoint, `aoi=17019&startdate=7/12/2022&enddate=7/12/2022` (Champaign County, IL) |
| `county-19169-2022-07-12.json` | same endpoint, `aoi=19169` (Story County, IA) |
| `county-31109-2022-07-12.json` | same endpoint, `aoi=31109` (Lancaster County, NE) |

Manual cross-check (2026-11-14): point-in-polygon of each demo farm against the official 2022-07-12 USDM GeoJSON
(`https://droughtmonitor.unl.edu/data/json/usdm_20220712.json`, 19.6 MB) gave Finney (38.1095, -100.706) = D3,
Champaign (40.048, -88.33) = D2, Story (42.0563, -93.495) and Lancaster (40.73, -96.55) = no drought polygon,
matching the predominant county category from these statistics.

The U.S. Drought Monitor is jointly produced by the National Drought Mitigation Center at the University of
Nebraska-Lincoln, the U.S. Department of Agriculture, the National Oceanic and Atmospheric Administration and NASA.
Data courtesy of NDMC, via https://droughtmonitor.unl.edu.
