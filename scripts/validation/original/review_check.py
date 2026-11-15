# Reviewer scratch check (new file). Truth/season as in fixes.py.
import json, csv, random
from collections import defaultdict
exec(open("fixes.py").read().split("def show")[0])  # reuse rows, gs, score, ci, ycorr
def line(k,f):
    s=score(gs,f); h=ci(gs,f,"hit"); a=ci(gs,f,"fa"); y="/".join(f"{v:+.2f}" for v in ycorr(f))
    print(f"{k:40} fires {100*s['alerts']:3.0f}% hit {100*s['hit']:3.0f}% [{100*h[0]:.0f}-{100*h[1]:.0f}] fa {100*s['fa']:3.0f}% prec {100*s['prec']:3.0f}% skill {100*s['skill']:3.0f}  yld {y}")
print("=== single-ingredient and matched-rate comparisons (growing season, in_drought)")
for k,f in {
 "proposed dry rain<=33 & soil<=25": lambda r:r["rainPct"]<=33 and r["rootPct"]<=25,
 "SOIL ONLY <=15": lambda r:r["rootPct"]<=15,
 "SOIL ONLY <=20": lambda r:r["rootPct"]<=20,
 "SOIL ONLY <=25": lambda r:r["rootPct"]<=25,
 "rain only <=33": lambda r:r["rainPct"]<=33,
 "rain<=50 & soil<=25": lambda r:r["rainPct"]<=50 and r["rootPct"]<=25,
 "rain<=100 & soil<=25 (=soil only)": lambda r:r["rootPct"]<=25,
}.items(): line(k,f)

# AUC: how well does each continuous score rank drought vs non-drought weeks (threshold-free)
def auc(sub,key):
    pos=[key(r) for r in sub if r["in_drought"]]; neg=[key(r) for r in sub if not r["in_drought"]]
    w=0
    negs=sorted(neg); import bisect
    for p in pos:
        lo=bisect.bisect_left(negs,p); hi=bisect.bisect_right(negs,p)
        w+= (len(negs)-hi) + 0.5*(hi-lo)   # lower score = drier = more drought-like
    return w/(len(pos)*len(neg))
print("\n=== AUC (0.5 = coin flip), lower pct = drier")
for nm,key in [("rain pct",lambda r:r["rainPct"]),("soil pct",lambda r:r["rootPct"]),("balance pct",lambda r:r["balPct"]),("max(rain,soil)",lambda r:max(r["rainPct"],r["rootPct"]))]:
    print(f"{nm:16} all {auc(gs,key):.2f}  2015-20 {auc([r for r in gs if r['week']<'2021'],key):.2f}  2021-25 {auc([r for r in gs if r['week']>='2021'],key):.2f}")

# Short-term truth: weekly USDM change over next 4 maps among weeks not already in drought; and 'drying' = D0+ rises
print("\n=== onset_4wk-like truth with soil vs rain (not-in-drought growing-season weeks)")
byd=defaultdict(list)
for r in rows: byd[r["district"]].append(r)
for l in byd.values():
    l.sort(key=lambda r:r["week"])
    for i,r in enumerate(l):
        nx=[x["d1"] for x in l[i+1:i+5]]
        r["onset"]=None if r["in_drought"] or len(nx)<4 else any(v>=50 for v in nx)
sub=[r for r in gs if r["onset"] is not None]
for r in sub: r["in_drought"]=r["onset"]
for nm,key in [("rain pct",lambda r:r["rainPct"]),("soil pct",lambda r:r["rootPct"]),("max(rain,soil)",lambda r:max(r["rainPct"],r["rootPct"]))]:
    print(f"{nm:16} onset AUC {auc(sub,key):.2f}")
