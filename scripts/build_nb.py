#!/usr/bin/env python3
"""Build data/nb.json and data/nb.topo.json from the vendored CEC neighborhood files (raw/cec/).

nb.topo.json  the CEC K26 neighborhood TopoJSON (EPSG:3857, quantized), properties cut to {u: id}.
nb.json       {"p25": [[code, name]], "p24": [...],
               "h": {UNIQ_ID: id}  (the CEC search API returns UNIQ_ID as "h"; some polygons have no UNIQ_ID, so "id" is the key),
               "n": {id: [settlement_code, locality, name, valid26, [k26 pidx, votes...], valid25, [p25 idx, votes...], valid24, [...]]},
               "k": {barzel: id}}
K25/K24 rows are joined by UNIQ_ID, or by (settlement code, neighborhood name) when UNIQ_ID is missing.
K26 neighborhood totals are recomputed from our own kalpiot26.json (kalpi location point-in-polygon, as the CEC builds them),
so they match the per-kalpi numbers on the site. K25/K24 come from the CEC files for the same UNIQ_ID and are shown as shares only.
"""
import json, math, os
from shapely.geometry import Point, Polygon, MultiPolygon
from shapely.strtree import STRtree

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW, OUT = os.path.join(ROOT, "raw", "cec"), os.path.join(ROOT, "data")
SH = os.environ.get("KALPI_SHARED", os.path.join(os.path.dirname(ROOT), "kalpi-shared"))
j = lambda p: json.load(open(p, encoding="utf-8"))


def decode(topo):
    sx, sy = topo["transform"]["scale"]; tx, ty = topo["transform"]["translate"]
    arcs = []
    for a in topo["arcs"]:
        x = y = 0; pts = []
        for dx, dy in a:
            x += dx; y += dy; pts.append((x * sx + tx, y * sy + ty))
        arcs.append(pts)
    def ring(ix):
        pts = []
        for i in ix:
            a = arcs[i] if i >= 0 else arcs[~i][::-1]
            pts += a[1:] if pts else a
        return pts
    out = []
    for g in list(topo["objects"].values())[0]["geometries"]:
        if g["type"] == "Polygon": polys = [g["arcs"]]
        elif g["type"] == "MultiPolygon": polys = g["arcs"]
        else: continue
        shp = MultiPolygon([Polygon(ring(p[0]), [ring(h) for h in p[1:]]) for p in polys]).buffer(0)
        out.append((g, shp))
    return out


def merc(lat, lon):
    return lon * 20037508.34 / 180, math.log(math.tan((90 + lat) * math.pi / 360)) * 6378137


k26 = j(os.path.join(OUT, "kalpiot26.json"))
topo = j(os.path.join(RAW, "latest_neighborhood_geometry.topojson"))
geoms = decode(topo)
tree = STRtree([s for _, s in geoms])
n, kmap, miss = {}, {}, 0
for g, _ in geoms:
    p = g["properties"]
    n[p["id"]] = [p["SETL_CODE"], p["שם ישוב"], p["neighborhood_name"], 0, {}]
for b in k26["b"]:
    pt = Point(*merc(b["y"], b["x"]))
    hit = [geoms[i] for i in tree.query(pt) if geoms[i][1].covers(pt)]
    if not hit: miss += len(b["k"]); continue
    u = hit[0][0]["properties"]["id"]
    for k in b["k"]:
        kmap[k[0]] = u; e = n[u]; e[3] += k[3] - k[4]
        for i in range(0, len(k[6]), 2): e[4][k[6][i]] = e[4].get(k[6][i], 0) + k[6][i + 1]
for e in n.values():
    e[4] = [x for c, v in sorted(e[4].items(), key=lambda t: -t[1]) if v for x in (c, v)]


def key(p): return ("u", p["UNIQ_ID"]) if p.get("UNIQ_ID") else ("n", p["SETL_CODE"], p["neighborhood_name"])
cur = {}
for g, _ in geoms:
    cur.setdefault(key(g["properties"]), g["properties"]["id"])
hmap = {g["properties"]["UNIQ_ID"]: g["properties"]["id"] for g, _ in geoms if g["properties"].get("UNIQ_ID")}


def past(year):
    pm = j(os.path.join(SH, f"parties{year}.json"))
    topo_y = j(os.path.join(RAW, f"{year}_neighborhood_geometry.topojson"))
    data = j(os.path.join(RAW, f"{year}_neighborhood_data.json"))
    id2u = {g["properties"]["id"]: key(g["properties"]) for g in list(topo_y["objects"].values())[0]["geometries"]}
    codes = [c for c in data["parties"] if c]
    plist = [[c, pm[c]["name"] if c in pm else c] for c in codes]
    got = 0
    for fid, f in data["features"].items():
        u = cur.get(id2u.get(int(fid)))
        if u not in n or len(n[u]) > (5 if year == 25 else 7): continue
        vec = [x for i, c in sorted(enumerate(codes), key=lambda t: -f.get(t[1], 0)) if f.get(c) for x in (i, f[c])]
        n[u] += [f["כשרים"], vec]; got += 1
    for e in n.values():
        if len(e) < (7 if year == 25 else 9): e += [0, []]
    return plist, got


p25, g25 = past(25)
p24, g24 = past(24)
n = {u: e for u, e in n.items() if e[3] or e[5] or e[7]}
json.dump({"p25": p25, "p24": p24, "h": hmap, "n": n, "k": kmap}, open(os.path.join(OUT, "nb.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
for g in list(topo["objects"].values())[0]["geometries"]:
    g["properties"] = {"u": g["properties"]["id"]}
json.dump(topo, open(os.path.join(OUT, "nb.topo.json"), "w", encoding="utf-8"), separators=(",", ":"))
print(json.dumps({"polygons": len(geoms), "neighborhoods_kept": len(n), "kalpiot_in_polygon": len(kmap), "kalpiot_outside": miss, "k25_joined": g25, "k24_joined": g24}))
