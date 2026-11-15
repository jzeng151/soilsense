"""Score the Field Watch rules against the U.S. Drought Monitor (USDM) and USDA yields.

Truths (fixed before looking at results):
  in_drought      D1-or-worse covers >= 50% of the district on that week's USDM map.
  onset_4wk       among weeks NOT in drought, D1+ reaches >= 50% within the next 4 maps.
  worsening_4wk   D1+ coverage rises by >= 20 points within the next 4 maps (any week).
Season: growing season = map date in April-September (primary); all-year also reported.
Uncertainty: 1,000 bootstrap resamples of whole district-years (weeks inside a year are not independent).
"""
import csv, json, random
from collections import defaultdict
from statistics import mean

B = "C:/Users/steve/AppData/Local/hermes/profiles/renshuu/cache/scratch/backtest"
rows = json.load(open(f"{B}/rows.json"))

RULES = {
    "A mine as written (<50% of avg)": lambda r: None if r["mine_status"] == "insufficient_data" else r["mine_status"] == "triggered",
    "B mine, ranking (driest 20%)": lambda r: None if r["mine_rankfrac"] is None else r["mine_rankfrac"] <= 0.20,
    "C tunk 'dry'": lambda r: None if r["tunk_status"] == "insufficient" else r["tunk_status"] == "dry",
    "D tunk 'watch' or 'dry'": lambda r: None if r["tunk_status"] == "insufficient" else r["tunk_status"] in ("watch", "dry"),
    "E tunk rain test only (<=20th pct)": lambda r: None if r["tunk_rainpct"] is None else r["tunk_rainpct"] <= 20,
}

# --- attach truths ---
by_d = defaultdict(list)
for r in rows:
    by_d[r["district"]].append(r)
for lst in by_d.values():
    lst.sort(key=lambda r: r["week"])
    for i, r in enumerate(lst):
        nxt = [x["d1"] for x in lst[i + 1 : i + 5]]
        r["in_drought"] = r["d1"] >= 50
        r["onset_4wk"] = None if r["in_drought"] or len(nxt) < 4 else any(v >= 50 for v in nxt)
        r["worsening_4wk"] = None if len(nxt) < 4 else max(nxt) - r["d1"] >= 20
        r["season"] = 4 <= int(r["week"][5:7]) <= 9
        r["dy"] = (r["district"], r["week"][:4])

sanity = sum(1 for r in rows if r["tunk_end"] and r["tunk_end"] != r["end"])
insuff = {k: sum(1 for r in rows if f(r) is None) for k, f in RULES.items()}


def score(sub, rule, truth):
    tp = fp = fn = tn = 0
    for r in sub:
        p, t = rule(r), r[truth]
        if p is None or t is None:
            continue
        if p and t: tp += 1
        elif p: fp += 1
        elif t: fn += 1
        else: tn += 1
    n = tp + fp + fn + tn
    return {
        "n": n,
        "alert_rate": (tp + fp) / n if n else float("nan"),
        "hit_rate": tp / (tp + fn) if tp + fn else float("nan"),       # share of truth weeks flagged
        "false_alarm": fp / (fp + tn) if fp + tn else float("nan"),    # share of non-truth weeks flagged
        "precision": tp / (tp + fp) if tp + fp else float("nan"),      # share of alerts that were right
    }


def boot(sub, rule, truth, metric, reps=1000, seed=7):
    groups = defaultdict(list)
    for r in sub:
        groups[r["dy"]].append(r)
    keys = list(groups)
    rnd = random.Random(seed)
    vals = []
    for _ in range(reps):
        s = [r for k in rnd.choices(keys, k=len(keys)) for r in groups[k]]
        v = score(s, rule, truth)[metric]
        if v == v:
            vals.append(v)
    vals.sort()
    return vals[int(0.025 * len(vals))], vals[int(0.975 * len(vals))]


out = {"sanity_window_mismatch": sanity, "insufficient": insuff, "weeks_total": len(rows)}
for season_name, sub in [("growing season (Apr-Sep)", [r for r in rows if r["season"]]), ("all year", rows)]:
    for truth in ["in_drought", "onset_4wk", "worsening_4wk"]:
        base = [r[truth] for r in sub if r[truth] is not None]
        print(f"\n=== {season_name} | truth={truth} | truth weeks {sum(base)}/{len(base)} ({100*sum(base)/len(base):.0f}%)")
        print(f"{'rule':38} {'alerts':>7} {'hit':>16} {'false alarm':>16} {'precision':>7}")
        for k, f in RULES.items():
            s = score(sub, f, truth)
            hl, hh = boot(sub, f, truth, "hit_rate")
            fl, fh = boot(sub, f, truth, "false_alarm")
            print(f"{k:38} {100*s['alert_rate']:6.0f}% {100*s['hit_rate']:4.0f}% [{100*hl:3.0f}-{100*hh:3.0f}] {100*s['false_alarm']:4.0f}% [{100*fl:3.0f}-{100*fh:3.0f}] {100*s['precision']:6.0f}%")

# --- yields: do district-years with more summer alert weeks have worse harvests? ---
def spearman(x, y):
    def rank(v):
        o = sorted(range(len(v)), key=lambda i: v[i]); rk = [0.0] * len(v); i = 0
        while i < len(o):
            j = i
            while j + 1 < len(o) and v[o[j + 1]] == v[o[i]]: j += 1
            for k in range(i, j + 1): rk[o[k]] = (i + j) / 2
            i = j + 1
        return rk
    rx, ry = rank(x), rank(y); mx, my = mean(rx), mean(ry)
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    den = (sum((a - mx) ** 2 for a in rx) * sum((b - my) ** 2 for b in ry)) ** 0.5
    return num / den if den else float("nan")

summer = defaultdict(lambda: defaultdict(int))
for r in rows:
    if 6 <= int(r["week"][5:7]) <= 8:
        for k, f in RULES.items():
            if f(r): summer[r["dy"]][k] += 1
yields = list(csv.DictReader(open(f"{B}/yield_validation.csv")))
print("\n=== Yields: Spearman correlation, summer (Jun-Aug) alert weeks vs yield % anomaly (more negative = alerts line up with bad harvests)")
for crop in ["corn", "sorghum", "soybeans"]:
    ys = [y for y in yields if y["crop"] == crop and y["yield_pct_anom"] not in ("", "nan")]
    line = f"{crop:9} n={len(ys):3}  "
    for k in RULES:
        x = [summer[(y["district"], y["year"])][k] for y in ys]
        line += f"{k[:1]}={spearman(x, [float(y['yield_pct_anom']) for y in ys]):+.2f}  "
    print(line)
print("\n", json.dumps(out))
