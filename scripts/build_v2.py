#!/usr/bin/env python3
"""Build the lazy-loaded v2 layers for the site from the helper outputs.

Inputs (default dir: ../kalpi-shared or $KALPI_SHARED):
  hist25.json, hist24.json, parties25.json, parties24.json  K25/K24 results attached to K26 kalpiot (key = ברזל)
  statareas/statareas26.geojson, statareas/kalpi_to_sa.json  CBS 2022 statistical areas with K26 results and SES cluster
Outputs:
  data/hist.json      {"25": {"parties": [[code, name]], "groups": [[agg, valid, [pidx, votes, ...]]]}, "24": {...},
                       "k": {barzel: [g25, m25, g24, m24]}}   m: 0 exact, 1 venue, 2 nearest, 3 none; g = -1 when none.
                      Entries that repeat a building/locality sum ("agg") are stored once as one group, so the
                      site can de-duplicate instead of summing the same votes twice. The site shows shares only.
  data/sa.json        {"sa": {code: [locality, name, ses_cluster, valid, [k26 pidx, votes, ...], ses_is_locality_level]}, "k": {barzel: sa}}
  data/statareas.geojson  simplified polygons (5-decimal coordinates) with code, winner, ses only.
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SH = os.environ.get("KALPI_SHARED", os.path.join(os.path.dirname(ROOT), "kalpi-shared"))
OUT = os.path.join(ROOT, "data")
MATCH = {"exact": 0, "venue": 1, "nearest": 2, "none": 3}

k26 = json.load(open(os.path.join(OUT, "kalpiot26.json"), encoding="utf-8"))
codes26 = [p[0] for p in k26["parties"]]
idx26 = {c: i for i, c in enumerate(codes26)}
ids = [k[0] for b in k26["b"] for k in b["k"]]


def hist(year):
    h = json.load(open(os.path.join(SH, f"hist{year}.json"), encoding="utf-8"))
    pm = json.load(open(os.path.join(SH, f"parties{year}.json"), encoding="utf-8"))
    order = sorted(pm, key=lambda c: -pm[c].get("votes", 0))
    pidx = {c: i for i, c in enumerate(order)}
    groups, gkey, k = [], {}, {}
    for bid in ids:
        e = h.get(str(bid))
        if not e or e.get("match") == "none" or not e.get(f"votes{year}"):
            k[bid] = [-1, 3]; continue
        votes = e[f"votes{year}"]
        for c in votes:
            if c not in pidx:
                pidx[c] = len(order); order.append(c)
        vec = []
        for c in sorted(votes, key=lambda c: pidx[c]):
            if votes[c]: vec += [pidx[c], votes[c]]
        agg = 2 if e.get("agg") == "loc" else (1 if e.get("agg") else 0)
        key = json.dumps([agg, e[f"valid{year}"], vec, e.get(f"k{year}") or e.get("k25")])
        if agg == 0: key += str(bid)  # a single-kalpi match is its own group
        g = gkey.get(key)
        if g is None:
            g = gkey[key] = len(groups); groups.append([agg, e[f"valid{year}"], vec])
        k[bid] = [g, MATCH[e["match"]]]
    parties = [[c, pm[c]["name"] if c in pm else c] for c in order]
    return {"parties": parties, "groups": groups}, k


h25, k25 = hist(25)
h24, k24 = hist(24)
kk = {b: k25[b] + k24[b] for b in ids}
json.dump({"25": h25, "24": h24, "k": kk}, open(os.path.join(OUT, "hist.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

# ---- statistical areas ----
g = json.load(open(os.path.join(SH, "statareas", "statareas26.geojson"), encoding="utf-8"))
k2s = json.load(open(os.path.join(SH, "statareas", "kalpi_to_sa.json"), encoding="utf-8"))["map"]
sa, feats = {}, []


def rnd(c):
    if isinstance(c[0], (int, float)): return [round(c[0], 5), round(c[1], 5)]
    out = [rnd(x) for x in c]
    if out and isinstance(out[0][0], float):  # ring: drop consecutive duplicates
        ded = [out[0]] + [p for a, p in zip(out, out[1:]) if p != a]
        out = ded if len(ded) >= 4 else out
    return out


for f in g["features"]:
    p = f["properties"]
    votes = p.get("votes") or {}
    vec = []
    for c in sorted(votes, key=lambda c: -votes[c]):
        if c in idx26 and votes[c]: vec += [idx26[c], votes[c]]
    sa[p["code"]] = [p.get("locality"), p.get("name"), p.get("ses_cluster"), p.get("valid") or 0, vec,
                     1 if str(p.get("ses_source") or "").startswith("locality") else 0]
    win = vec[0] if vec else -1
    feats.append({"type": "Feature", "properties": {"c": p["code"]},
                  "geometry": {"type": f["geometry"]["type"], "coordinates": rnd(f["geometry"]["coordinates"])}})
ksa = {int(b): v["sa"] for b, v in k2s.items() if isinstance(v, dict) and v.get("sa")}
json.dump({"sa": sa, "k": ksa}, open(os.path.join(OUT, "sa.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
json.dump({"type": "FeatureCollection", "features": feats}, open(os.path.join(OUT, "statareas.geojson"), "w", encoding="utf-8"), separators=(",", ":"))
for n in ["hist.json", "sa.json", "statareas.geojson"]:
    print(n, os.path.getsize(os.path.join(OUT, n)))
print("groups25", len(h25["groups"]), "groups24", len(h24["groups"]), "none25", sum(1 for b in ids if k25[b][0] < 0), "none24", sum(1 for b in ids if k24[b][0] < 0), "sa", len(sa), "kalpi->sa", len(ksa))
