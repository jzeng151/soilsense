"""Recalculate exploratory Kansas backtest summaries from recorded rows, without network or tuning.

Usage: python scripts/validation/summarize.py --data-dir PATH --output docs/validation/kansas-results.json
The supplied backtest directory is external; hashes identify exactly what was tested.
This scores recorded candidate outputs, NOT the current Field Watch implementation.
"""
import argparse
import csv
import hashlib
import json
import math
import random
from collections import defaultdict
from pathlib import Path
from statistics import mean

VERSION = "recorded-kansas-summary-v1"
INPUTS = ("rows.json", "fixrows.json", "yield_validation.csv", "usdm_district_weekly.csv")


def known(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def score(rows, rule):
    counts = dict(tp=0, fp=0, fn=0, tn=0)
    skipped = 0
    for row in rows:
        prediction = rule(row)
        if prediction is None or not known(row.get("d1")):
            skipped += 1
            continue
        truth = row["d1"] >= 50
        counts["tp" if prediction and truth else "fp" if prediction else "fn" if truth else "tn"] += 1
    tp, fp, fn, tn = (counts[k] for k in ("tp", "fp", "fn", "tn"))
    n = tp + fp + fn + tn
    ratio = lambda a, b: a / b if b else None
    return {**counts, "n": n, "skipped": skipped, "alert_rate": ratio(tp + fp, n),
            "hit_rate": ratio(tp, tp + fn), "false_positive_rate": ratio(fp, fp + tn), "precision": ratio(tp, tp + fp)}


def threshold(key, cutoff):
    return lambda row: row[key] <= cutoff if known(row.get(key)) else None


def combine(left, right, both=True):
    def rule(row):
        a, b = left(row), right(row)
        # Unknown remains unknown in this exploratory score, never zero/no-alert.
        if a is None or b is None:
            return None
        return a and b if both else a or b
    return rule


def status(key, allowed, missing):
    return lambda row: None if row.get(key) in (None, missing) else row[key] in allowed


def candidates():
    rain = lambda cutoff: threshold("rainPct", cutoff)
    soil = lambda cutoff: threshold("rootPct", cutoff)
    return {
        "A_rain_below_half_mean": status("mine_status", ("triggered",), "insufficient_data"),
        "B_rain_driest_fifth": threshold("mine_rankfrac", .2),
        "C_recorded_v1_dry": status("tunk_status", ("dry",), "insufficient"),
        "D_recorded_v1_watch_or_dry": status("tunk_status", ("watch", "dry"), "insufficient"),
        "E_recorded_v1_rain_only": threshold("tunk_rainpct", 20),
        "proposed_33_25": combine(rain(33), soil(25)),
        "soil_only_25": soil(25),
        "anchored_dry_20_20": combine(rain(20), soil(20)),
        "anchored_watch_30_or_30": combine(rain(30), soil(30), both=False),
    }


def interval(rows, rule, metric, reps=1000):
    groups = defaultdict(list)
    for row in rows:
        groups[(row["district"], row["week"][:4])].append(row)
    keys = sorted(groups)
    rng, values = random.Random(7), []
    for _ in range(reps):
        sample = [row for key in rng.choices(keys, k=len(keys)) for row in groups[key]]
        value = score(sample, rule)[metric]
        if value is not None:
            values.append(value)
    values.sort()
    return [values[int(.025 * len(values))], values[min(len(values) - 1, int(.975 * len(values)))]] if values else None


def spearman(x, y):
    def rank(values):
        order = sorted(range(len(values)), key=lambda i: values[i])
        ranks, i = [0.] * len(values), 0
        while i < len(order):
            j = i
            while j + 1 < len(order) and values[order[j + 1]] == values[order[i]]:
                j += 1
            for k in range(i, j + 1):
                ranks[order[k]] = (i + j) / 2
            i = j + 1
        return ranks
    if len(x) < 2:
        return None
    rx, ry = rank(x), rank(y)
    mx, my = mean(rx), mean(ry)
    denominator = (sum((a - mx) ** 2 for a in rx) * sum((b - my) ** 2 for b in ry)) ** .5
    return sum((a - mx) * (b - my) for a, b in zip(rx, ry)) / denominator if denominator else None


def load_rows(directory):
    rows = json.loads((directory / "rows.json").read_text())
    fixes = json.loads((directory / "fixrows.json").read_text())
    key = lambda row: (row["district"], row["week"])
    base = {key(row): row for row in rows}
    changes = {key(row): row for row in fixes}
    if len(base) != len(rows) or len(changes) != len(fixes):
        raise ValueError("Duplicate district/week record")
    if base.keys() != changes.keys():
        raise ValueError("Recorded candidate rows and fixed-baseline rows are not aligned")
    return [{**row, **changes[key(row)]} for row in rows]


def summarize(directory, reps=1000):
    rows = load_rows(directory)
    growing = [row for row in rows if 4 <= int(row["week"][5:7]) <= 9]
    with (directory / "yield_validation.csv").open(newline="") as handle:
        yields = list(csv.DictReader(handle))
    result = {"version": VERSION, "input_sha256": {name: hashlib.sha256((directory / name).read_bytes()).hexdigest() for name in INPUTS},
              "scope": "Exploratory recorded Kansas candidate rows; not current-rule or live validation", "weeks": len(rows),
              "districts": sorted({row["district"] for row in rows}), "growing_weeks": len(growing),
              "growing_drought_weeks": sum(row["d1"] >= 50 for row in growing),
              "window_mismatches": sum(bool(row.get("tunk_end")) and row["tunk_end"] != row["end"] for row in rows),
              "rules": {}}
    for name, rule in candidates().items():
        annual, missing = defaultdict(int), set()
        for row in rows:
            if 6 <= int(row["week"][5:7]) <= 8:
                key = (row["district"], row["week"][:4])
                prediction = rule(row)
                if prediction is None:
                    missing.add(key)
                elif prediction:
                    annual[key] += 1
        correlations = {}
        for crop in ("corn", "sorghum", "soybeans"):
            crop_rows = [row for row in yields if row["crop"] == crop and row["yield_pct_anom"] not in ("", "nan") and (row["district"], row["year"]) not in missing]
            correlations[crop] = {"n": len(crop_rows), "rho": spearman([annual[(r["district"], r["year"])] for r in crop_rows], [float(r["yield_pct_anom"]) for r in crop_rows])}
        result["rules"][name] = {**score(growing, rule), "hit_ci_district_year": interval(growing, rule, "hit_rate", reps),
                                  "false_positive_ci_district_year": interval(growing, rule, "false_positive_rate", reps), "yield_associations": correlations}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--bootstrap", type=int, default=1000)
    args = parser.parse_args()
    if args.bootstrap < 1:
        parser.error("--bootstrap must be positive")
    result = summarize(args.data_dir, args.bootstrap)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n")
    print(json.dumps({"output": str(args.output), "weeks": result["weeks"], "growing_weeks": result["growing_weeks"], "rules": len(result["rules"])}))


if __name__ == "__main__":
    main()
