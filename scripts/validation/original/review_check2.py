exec(open("review_check.py").read().split('print("=== single')[0])
for k,f in {"conv D0: rain<=30 & soil<=30":lambda r:r["rainPct"]<=30 and r["rootPct"]<=30,
            "conv D1: rain<=20 & soil<=20":lambda r:r["rainPct"]<=20 and r["rootPct"]<=20,
            "conv watch: rain<=30 or soil<=30":lambda r:r["rainPct"]<=30 or r["rootPct"]<=30}.items(): line(k,f)
yrs=sorted({r["week"][:4] for r in gs})
for y in yrs:
    s=[r for r in gs if r["week"][:4]==y]; print(y, f"drought share {100*sum(r['in_drought'] for r in s)/len(s):.0f}%", end=" | ")
