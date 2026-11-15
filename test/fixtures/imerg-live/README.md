# Live NASA GES DISC IMERG point responses

Retrieved 2026-11-15 using a server-side Earthdata Bearer credential after the account holder accepted GES DISC terms. Credentials, redirect authorization URLs and response headers are deliberately absent.

Product: **GPM_3IMERGDL**, version **07**, processing stream **Late**, native granule revision **V07C**, UTC observation day **2026-11-13**. Source DOI: https://doi.org/10.5067/GPM/IMERGDL/DAY/07 . Provider: NASA GES DISC; Huffman, G.J.; Stocker, E.F.; Bolvin, D.T.; Nelkin, E.J.; Tan, J.

`manifest.json` records exact credential-free DAP4 `.dap?dap4.ce=...` point URLs, independent constrained ASCII URLs, locations, retrieval timestamp and SHA-256 of each binary response. Each response contains only precipitation, precipitation sample count and time/longitude/latitude for one cell. `.ascii` files are independently requested readable source excerpts; `.dap` files are exact raw chunked DAP4 responses including metadata and variable CRC32. `late-20261113.dmr.xml` is the exact full metadata response used to validate dimensions. `late-finney-20261113.dap` is the initial Finney probe; the manifest-named `late-finney-ks-20261113.dap` is the later four-field collection.

Native metadata says `precipitation` is **mm/day**, daily mean precipitation rate (not the half-hourly IMERG product's mm/hr). Require count 48 for a complete UTC day's depth. These are 0.1° containing-cell points, not field-area averages. Independent ASCII values: Story 0, Champaign 0.045, Finney 0, Lancaster 0 mm/day; every count is 48. Zero here is an actual retrieved observation, not a replacement for fill/missing.

The verified legacy Hyrax DAP4 endpoint uses Int16 for the selected `precipitation_cnt`; other current cloud V07C metadata can use Int8. The decoder supports both without relying on DAP2 DDS. `.dap.csv` on this server returned blank precipitation/count cells despite valid DAP4 binary values: never treat those blanks as zero. `.json` returned malformed JSON with adjacent grid nodes: it is not used.

IMERG UTC and POWER local-solar days are not equivalent daily intervals. These fixtures validate source transport/parser behavior, not day-level agreement, agronomic confidence or Field Watch rule v2. Only qualified multi-day totals may be compared.
