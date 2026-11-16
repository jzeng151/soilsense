"""Test the proposed fixes. Truth/season/bootstrap as in analyze.py (D1+ >= 50% of district; Apr-Sep)."""
import csv, json, random
from collections import defaultdict
from statistics import mean

B = "C:/Users/steve/AppData/Local/hermes/profiles/renshuu/cache/scratch/backtest"
base = {(r["district"], r["week"]): r for r in json.load(open(f"{B}/rows.json"))}
rows = []
for f in json.load(open(f"{B}/fixrows.json")):
    r = {**base[(f["district"], f["week"])], **f}
    r["in_drought"] = r["d1"] >= 50
    r["season"] = 4 <= int(r["week"][5:7]) <= 9
    r["dy"] = (r["district"], r["week"][:4])
    rows.append(r)
gs = [r for r in rows if r["season"]]
print("missing ranks:", {k: sum(r[k] is None for r in rows) for k in ("rainPct", "rootPct", "balPct", "balMm")})
print(f"growing-season weeks with balance <= -15 mm: {100*mean(r['balMm'] <= -15 for r in gs):.0f}%")


def score(sub, rule):
    tp = fp = fn = tn = 0
    for r in sub:
        p, t = rule(r), r["in_drought"]
        if p and t: tp += 1
        elif p: fp += 1
        elif t: fn += 1
        else: tn += 1
    n = tp + fp + fn + tn
    hit = tp / (tp + fn) if tp + fn else float("nan")
    fa = fp / (fp + tn) if fp + tn else float("nan")
    return {"alerts": (tp + fp) / n, "hit": hit, "fa": fa, "prec": tp / (tp + fp) if tp + fp else float("nan"), "skill": hit - fa}


def ci(sub, rule, metric, reps=1000):
    g = defaultdict(list)
    for r in sub: g[r["dy"]].append(r)
    keys, rnd, v = list(g), random.Random(7), []
    for _ in range(reps):
        x = score([r for k in rnd.choices(keys, k=len(keys)) for r in g[k]], rule)[metric]
        if x == x: v.append(x)
    v.sort()
    return v[25], v[974]


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
    return num / (sum((a - mx) ** 2 for a in rx) * sum((b - my) ** 2 for b in ry)) ** 0.5

yields = [y for y in csv.DictReader(open(f"{B}/yield_validation.csv")) if y["crop"] in ("corn", "sorghum", "soybeans")]
def ycorr(rule):
    cnt = defaultdict(int)
    for r in rows:
        if 6 <= int(r["week"][5:7]) <= 8 and rule(r): cnt[r["dy"]] += 1
    out = []
    for crop in ("corn", "sorghum", "soybeans"):
        ys = [y for y in yields if y["crop"] == crop]
        out.append(spearman([cnt[(y["district"], y["year"])] for y in ys], [float(y["yield_pct_anom"]) for y in ys]))
    return out

def show(title, rules):
    print(f"\n=== {title}")
    print(f"{'rule':52} {'fires':>5} {'hit [95%]':>14} {'false alarm':>16} {'right':>5}  yields corn/sorg/soy")
    for k, f in rules.items():
        s = score(gs, f); h = ci(gs, f, "hit"); a = ci(gs, f, "fa")
        yc = "/".join(f"{v:+.2f}" for v in ycorr(f))
        print(f"{k:52} {100*s['alerts']:4.0f}% {100*s['hit']:4.0f}% [{100*h[0]:2.0f}-{100*h[1]:2.0f}] {100*s['fa']:5.0f}% [{100*a[0]:2.0f}-{100*a[1]:2.0f}] {100*s['prec']:4.0f}%  {yc}")

show("Fix 4 - fixed 1991-2020 period vs Tunk's moving one ('dry')", {
    "Tunk as-is (1991..last year)": lambda r: r["tunk_status"] == "dry",
    "fixed 1991-2020, same cut-offs": lambda r: r["rainPct"] <= 20 and r["rootPct"] <= 30,
})
show("Fix 1 - backup when soil data is missing (soil hidden for every week)", {
    "rain only": lambda r: r["rainPct"] <= 20,
    "current: rain<=20 & balance <= -15 mm": lambda r: r["rainPct"] <= 20 and r["balMm"] <= -15,
    "proposed: rain<=20 & balance rank <= 30": lambda r: r["rainPct"] <= 20 and r["balPct"] <= 30,
    "(reference: rain<=20 & soil<=30)": lambda r: r["rainPct"] <= 20 and r["rootPct"] <= 30,
})
show("Fix 2 - one soil cut-off for both levels ('watch' or 'dry')", {
    "current: rain<=33 or soil<=25": lambda r: r["rainPct"] <= 33 or r["rootPct"] <= 25,
    "unified 30: rain<=33 or soil<=30": lambda r: r["rainPct"] <= 33 or r["rootPct"] <= 30,
})
show("Fix 2 - 'dry' with the unified cut-off", {
    "current: rain<=20 & soil<=30": lambda r: r["rainPct"] <= 20 and r["rootPct"] <= 30,
    "unified 25: rain<=20 & soil<=25": lambda r: r["rainPct"] <= 20 and r["rootPct"] <= 25,
})

# Fix 3 - cut-off grid: choose on 2015-2020, check on 2021-2025.
print("\n=== Fix 3 - 'dry' cut-off grid, skill = hit rate - false-alarm rate (growing season)")
train = [r for r in gs if r["week"] < "2021"]; test = [r for r in gs if r["week"] >= "2021"]
grid = []
for rc in (10, 15, 20, 25, 33):
    for sc in (15, 20, 25, 30, 35, 40, 50):
        f = lambda r, rc=rc, sc=sc: r["rainPct"] <= rc and r["rootPct"] <= sc
        grid.append((rc, sc, score(train, f), score(test, f)))
grid.sort(key=lambda g: -g[2]["skill"])
print(f"{'rain<=':>6} {'soil<=':>6} | {'train skill':>11} {'hit':>4} {'fa':>4} | {'test skill':>10} {'hit':>4} {'fa':>4}")
for rc, sc, a, b in grid[:8] + [g for g in grid if (g[0], g[1]) == (20, 30)]:
    print(f"{rc:6} {sc:6} | {100*a['skill']:11.0f} {100*a['hit']:4.0f} {100*a['fa']:4.0f} | {100*b['skill']:10.0f} {100*b['hit']:4.0f} {100*b['fa']:4.0f}")
print("train truth weeks:", sum(r["in_drought"] for r in train), "/", len(train), " test:", sum(r["in_drought"] for r in test), "/", len(test))
