"""Build compact crop-insurance loss summaries from USDA RMA "Cause of Loss" files.

Source (public, no key): https://pubfs-rma.fpac.usda.gov/pub/Web_Data_Files/Summary_of_Business/cause_of_loss/
Download colsom_YYYY.zip for the years you want into one folder, then run:

    python scripts/build-rma-losses.py <folder-with-zips> web/public/data/rma

Output: one JSON file per state, web/public/data/rma/<STATE FIPS>.json:
    { "years": [1991, ...], "groups": ["drought", ...],
      "counties": { "<county code>": { "<crop id>": { "<year>": [indemnity $ per group, rounded to $100], ... } } } }
Only the crops SoilSense models are kept, and price-only claims (e.g. "Decline in Price") are dropped because they
are not caused by weather. The Worker serves these files as static assets.
"""

import io
import json
import os
import re
import sys
import zipfile
from collections import defaultdict

# RMA commodity name -> SoilSense crop id
CROPS = {
    "WHEAT": "winter_wheat",
    "CORN": "corn",
    "SOYBEANS": "soybean",
    "GRAIN SORGHUM": "sorghum",
    "OATS": "oats",
    "FORAGE PRODUCTION": "alfalfa",
}

GROUPS = ["drought", "wet", "hail", "wind", "cold", "pests", "other"]


def group_of(cause: str) -> str | None:
    c = cause.lower()
    if "price" in c or "revenue" in c or "area plan" in c:
        return None  # market, not weather
    if any(k in c for k in ("drought", "heat", "hot wind")):
        return "drought"
    if any(k in c for k in ("excess moisture", "precip", "rain", "flood", "excess water")):
        return "wet"
    if "hail" in c:
        return "hail"
    if any(k in c for k in ("wind", "tornado", "hurricane", "cyclone", "tropical")):
        return "wind"
    if any(k in c for k in ("freeze", "frost", "cold", "snow", "ice")):
        return "cold"
    if any(k in c for k in ("disease", "insect", "mycotoxin", "aflatoxin", "wildlife", "weed", "virus", "pest")):
        return "pests"
    return "other"


def main(src: str, out: str) -> None:
    os.makedirs(out, exist_ok=True)
    # state -> county -> crop -> year -> [8 groups]
    data: dict = defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: [0.0] * len(GROUPS)))))
    years = []
    for name in sorted(os.listdir(src)):
        m = re.match(r"colsom_(\d{4})\.zip$", name)
        if not m:
            continue
        with zipfile.ZipFile(os.path.join(src, name)) as z:
            member = next(n for n in z.namelist() if n.lower().endswith(".txt"))
            with z.open(member) as f:
                for line in io.TextIOWrapper(f, encoding="latin-1"):
                    c = [x.strip() for x in line.split("|")]
                    if len(c) < 29:
                        continue
                    crop = CROPS.get(c[6].upper())
                    g = group_of(c[12])
                    if not crop or g is None:
                        continue
                    try:
                        year = int(c[0])
                        indemnity = float(c[28] or 0)
                    except ValueError:
                        continue
                    if indemnity <= 0:
                        continue
                    data[c[1]][c[3]][crop][year][GROUPS.index(g)] += indemnity
        years.append(int(m.group(1)))
        print(name, "done", file=sys.stderr)

    total = 0
    for state, counties in data.items():
        doc = {
            "source": "USDA Risk Management Agency, Summary of Business: Cause of Loss (colsom), indemnities by cause",
            "years": sorted(years),
            "groups": GROUPS,
            "counties": {
                county: {crop: {str(y): [round(v / 100) * 100 for v in vals] for y, vals in sorted(by_year.items())} for crop, by_year in crops.items()}
                for county, crops in counties.items()
            },
        }
        path = os.path.join(out, f"{state}.json")
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(doc, fh, separators=(",", ":"))
        total += os.path.getsize(path)
    print(f"wrote {len(data)} state files, {total / 1e6:.1f} MB total", file=sys.stderr)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
