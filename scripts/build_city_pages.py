#!/usr/bin/env python3
"""Static per-locality landing pages + OG images, computed only from data/*.json.

Writes (all relative to the repo root):
  city/<slug>.html        one page per locality, top 50 by eligible voters (CBS locality code from kalpiot26.json)
  city/index.html         list of those localities
  city/og/<slug>.png      1200x630 Open Graph image per locality (matplotlib)
  og/og-default.png       1200x630 site-wide OG image (all regular ballot boxes)
  sitemap.xml             home + city pages
Needs: matplotlib, python-bidi (pip install matplotlib python-bidi). Run: python3 scripts/build_city_pages.py [--top 50]
Numbers: 2026 = sum of regular ballot boxes in the locality (double envelopes excluded, as on the site).
2022 = the harelc crosswalk groups attached to those boxes in hist.json, each group counted once; compared by list name only.
"""
import argparse, collections, html, json, os, sys, urllib.parse
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://zozo123.github.io/kalpi-map/"
FONT_DIRS = ["/usr/share/fonts/truetype/sand-box/google/IBM Plex Sans Hebrew", "/usr/share/fonts/truetype"]

# Latin slugs for the URL (Hebrew names stay in the page). Unknown codes fall back to "loc-<CBS code>".
SLUGS = {5000: "tel-aviv-yafo", 3000: "jerusalem", 4000: "haifa", 8300: "rishon-lezion", 7400: "netanya", 7900: "petah-tikva",
  70: "ashdod", 9000: "beer-sheva", 6600: "holon", 8600: "ramat-gan", 7100: "ashkelon", 6200: "bat-yam", 6100: "bnei-brak",
  8400: "rehovot", 2610: "beit-shemesh", 6400: "herzliya", 6500: "hadera", 6900: "kfar-saba", 1200: "modiin-maccabim-reut",
  8700: "raanana", 7000: "lod", 8500: "ramla", 9100: "nahariya", 7300: "nazareth", 2600: "eilat", 2640: "rosh-haayin",
  9700: "hod-hasharon", 2630: "kiryat-gat", 6300: "givatayim", 7700: "afula", 6800: "kiryat-ata", 7600: "acre",
  1161: "rahat", 8200: "kiryat-motzkin", 1139: "karmiel", 1061: "nof-hagalil", 2710: "umm-al-fahm", 2650: "ramat-hasharon",
  2660: "yavne", 9600: "kiryat-yam", 9500: "kiryat-bialik", 3797: "modiin-illit", 6700: "tiberias", 7200: "ness-ziona",
  2620: "kiryat-ono", 7800: "pardes-hanna-karkur", 246: "netivot", 3780: "beitar-illit", 2730: "tayibe", 8800: "shefaram"}

def pname(n): return n.replace(" (לא התמודדה)", "").strip()
def pct(x): return f"{x*100:.1f}%"
def fmt(n): return f"{n:,}"
def esc(s): return html.escape(str(s), quote=True)

def load():
    j = lambda f: json.load(open(os.path.join(ROOT, "data", f), encoding="utf-8"))
    return j("kalpiot26.json"), j("hist.json"), j("nb.json")

def summarize(ks, K, H):
    P = K["parties"]
    el = sum(k[2] for k in ks); vo = sum(k[3] for k in ks); inv = sum(k[4] for k in ks)
    votes = collections.Counter()
    for k in ks:
        v = k[6]
        for i in range(0, len(v), 2): votes[pname(P[v[i]][1])] += v[i + 1]
    valid = sum(votes.values())
    groups = {H["k"][str(k[0])][0] for k in ks if str(k[0]) in H["k"] and H["k"][str(k[0])][0] >= 0}
    E = H["25"]; pv = 0; prev = collections.Counter()
    for g in groups:
        G = E["groups"][g]; pv += G[1]
        for i in range(0, len(G[2]), 2): prev[pname(E["parties"][G[2][i]][1])] += G[2][i + 1]
    names25 = {pname(p[1]) for p in E["parties"]}
    color = {pname(p[1]): p[4] for p in P}
    rows = []
    for n, v in votes.most_common():
        s = v / valid
        s22 = prev[n] / pv if pv and n in names25 else None
        rows.append(dict(name=n, v=v, s=s, s22=s22, d=(s - s22) if s22 is not None else None, color=color.get(n, "#8c939b")))
    return dict(eligible=el, voters=vo, invalid=inv, valid=valid, turnout=vo / el if el else 0, kalpiot=len(ks), rows=rows, valid22=pv)

def neighborhoods(code, N, P):
    out = []
    for u, r in N["n"].items():
        if r[0] != code or not r[3]: continue
        vec = r[4]; best = max(range(0, len(vec), 2), key=lambda i: vec[i + 1])
        out.append(dict(name=r[2], valid=r[3], lead=pname(P[vec[best]][1]), share=vec[best + 1] / r[3], color=P[vec[best]][4]))
    return sorted(out, key=lambda x: -x["valid"])

# ---------- OG image ----------
def og_image(path, title, subtitle, stats, rows, foot):
    import matplotlib; matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib import font_manager as fm
    # matplotlib >= 3.11 lays out RTL text itself (verified: Hebrew renders correctly unmodified); older versions
    # draw logical order, so reorder with python-bidi there.
    if tuple(int(x) for x in matplotlib.__version__.split(".")[:2]) >= (3, 11): get_display = lambda s: s
    else: from bidi.algorithm import get_display
    reg = bold = None
    for d in FONT_DIRS:
        r, b = os.path.join(d, "IBMPlexSansHebrew-Regular.ttf"), os.path.join(d, "IBMPlexSansHebrew-Bold.ttf")
        if os.path.exists(r): reg, bold = fm.FontProperties(fname=r), fm.FontProperties(fname=b); break
    if reg is None: sys.exit("Hebrew font not found; set FONT_DIRS")
    he = lambda s: get_display(s)
    fig = plt.figure(figsize=(12, 6.3), dpi=100); fig.patch.set_facecolor("#f7f6f2")
    ax = fig.add_axes([0, 0, 1, 1]); ax.set_xlim(0, 1200); ax.set_ylim(630, 0); ax.axis("off")
    ax.add_patch(plt.Rectangle((0, 0), 1200, 12, color="#33415c"))
    R = 1144
    ax.text(R, 62, he("הבחירות לכנסת ה-26 · 27.10.2026"), ha="right", va="center", fontproperties=reg, fontsize=17, color="#5f6368")
    ax.text(R, 128, he(title), ha="right", va="center", fontproperties=bold, fontsize=40 if len(title) < 14 else 30, color="#1d1d1f")
    ax.text(R, 190, he(subtitle), ha="right", va="center", fontproperties=bold, fontsize=22, color="#33415c")
    for i, s in enumerate(stats): ax.text(R, 240 + i * 34, he(s), ha="right", va="center", fontproperties=reg, fontsize=16, color="#5f6368")
    ax.text(R, 520, he("בדקו את הכתובת שלכם:"), ha="right", va="center", fontproperties=bold, fontsize=17, color="#1d1d1f")
    ax.text(R, 556, "zozo123.github.io/kalpi-map", ha="right", va="center", fontproperties=bold, fontsize=21, color="#33415c")
    ax.plot([600, 600], [50, 560], color="#e2e0da", lw=2)
    mx = max(r["s"] for r in rows[:5]) or 1
    ax.text(570, 62, he("2026 · שינוי מ-2022 (נק' אחוז)"), ha="right", va="center", fontproperties=reg, fontsize=14, color="#5f6368")
    for i, r in enumerate(rows[:5]):
        y = 110 + i * 88
        fs = 17 if len(r["name"]) <= 10 else 14 if len(r["name"]) <= 14 else 12
        ax.text(570, y, he(r["name"]), ha="right", va="center", fontproperties=bold, fontsize=fs, color="#1d1d1f")
        x1, x0 = 380, 130; w = (x1 - x0) * r["s"] / mx
        ax.add_patch(plt.Rectangle((x0, y - 11), x1 - x0, 22, color="#ebe9e3"))
        ax.add_patch(plt.Rectangle((x1 - w, y - 11), w, 22, color=r["color"]))
        ax.text(48, y, pct(r["s"]), ha="left", va="center", fontproperties=bold, fontsize=18, color="#1d1d1f")
        if r["d"] is None:
            ax.text(x1, y + 30, he("לא התמודדה ב-2022 בשם זה"), ha="right", va="center", fontproperties=reg, fontsize=12.5, color="#5f6368")
        else:  # label | signed number | unit, as separate runs so bidi never moves the sign
            v = r["d"] * 100
            ax.text(x1, y + 30, he("לעומת 2022:"), ha="right", va="center", fontproperties=reg, fontsize=12.5, color="#5f6368")
            ax.text(x1 - 102, y + 30, ("+" if v > 0.05 else "−" if v < -0.05 else "±") + f"{abs(v):.1f}", ha="right", va="center", fontproperties=bold, fontsize=12.5, color="#33415c")
            ax.text(x1 - 152, y + 30, he("נק׳ אחוז"), ha="right", va="center", fontproperties=reg, fontsize=12.5, color="#5f6368")
    ax.text(R, 605, he(foot), ha="right", va="center", fontproperties=reg, fontsize=11.5, color="#5f6368")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fig.savefig(path, dpi=100, facecolor=fig.get_facecolor()); plt.close(fig)

# ---------- HTML ----------
CSS = """:root{--bg:#f7f6f2;--card:#fff;--text:#1d1d1f;--muted:#5f6368;--line:#e2e0da;--accent:#1f5fbf}
@media (prefers-color-scheme:dark){:root{--bg:#17181a;--card:#222326;--text:#ececec;--muted:#a6a8ab;--line:#3a3b3f;--accent:#7fb0ff}}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Arial,"Noto Sans Hebrew",sans-serif;background:var(--bg);color:var(--text);line-height:1.55}
main{max-width:860px;margin:0 auto;padding:16px}h1{font-size:1.6rem;margin:.2em 0}h2{font-size:1.15rem;margin:1.4em 0 .4em}
.crumb,.meta{color:var(--muted);font-size:.9rem}.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin:12px 0}
.cta{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:700;margin:6px 0}
table{border-collapse:collapse;width:100%;font-size:.92rem}th,td{padding:4px 6px;border-bottom:1px solid var(--line);text-align:start;font-variant-numeric:tabular-nums}
td.n{direction:ltr;text-align:end}.sw{display:inline-block;width:10px;height:10px;border-radius:2px;margin-inline-end:6px;vertical-align:middle}
.bar{height:8px;border-radius:4px;background:var(--line);overflow:hidden;min-width:60px}.bar i{display:block;height:100%}
.share a{display:inline-block;margin:4px 4px 0 0;padding:8px 12px;border-radius:10px;color:#fff;text-decoration:none;font-size:.9rem}
.wa{background:#1f8f4e}.tg{background:#2a86c9}.x{background:#111}.fb{background:#1b5fc8}
.cities{columns:3 10em;padding-inline-start:1.2em}a{color:var(--accent)}img.og{width:100%;height:auto;border-radius:12px;border:1px solid var(--line)}
.card{overflow-x:auto}@media (max-width:520px){.b{display:none}table{font-size:.85rem}}"""

def share_links(text, url):
    t, u = urllib.parse.quote(text), urllib.parse.quote(url, safe="")
    return (f'<div class="share"><a class="wa" href="https://wa.me/?text={urllib.parse.quote(text + " " + url)}" target="_blank" rel="noopener">וואטסאפ</a>'
            f'<a class="tg" href="https://t.me/share/url?url={u}&amp;text={t}" target="_blank" rel="noopener">טלגרם</a>'
            f'<a class="x" href="https://x.com/intent/post?text={t}&amp;url={u}" target="_blank" rel="noopener">X</a>'
            f'<a class="fb" href="https://www.facebook.com/sharer/sharer.php?u={u}" target="_blank" rel="noopener">פייסבוק</a></div>')

def head(title, desc, url, img):
    return f"""<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title><meta name="description" content="{esc(desc)}"><link rel="canonical" href="{url}"><link rel="icon" href="data:,">
<meta property="og:type" content="website"><meta property="og:locale" content="he_IL"><meta property="og:site_name" content="קלפיות ותוצאות לפי כתובת">
<meta property="og:title" content="{esc(title)}"><meta property="og:description" content="{esc(desc)}"><meta property="og:url" content="{url}">
<meta property="og:image" content="{img}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{esc(title)}"><meta name="twitter:description" content="{esc(desc)}"><meta name="twitter:image" content="{img}">
<style>{CSS}</style>
<!-- analytics: none. A privacy-friendly, cookieless counter (Plausible/GoatCounter/Umami) may be added here later; disabled by default. -->
"""

SOURCES = """<h2>שיטה ומקורות</h2><ul class="meta">
<li>תוצאות 2026: סכום הקלפיות הרגילות ביישוב לפי קובץ ועדת הבחירות המרכזית (תמונת מצב 31.10.2026, דרך harelc/elections-vote-transfer). קולות המעטפות הכפולות אינם משויכים ליישוב ולכן אינם כלולים, ולכן המספרים שונים מהתוצאות הרשמיות, ואחוז ההצבעה בקלפיות נמוך מאחוז ההצבעה הכולל (בעלי זכות שהצביעו במעטפה כפולה נספרים במכנה בלבד).</li>
<li>השוואה ל-2022: קבוצות הקלפיות של 2022 ששויכו לקלפיות היישוב (שיוך harelc, כל קבוצה נספרת פעם אחת). זהו קירוב. ההשוואה לפי שם הרשימה בלבד; רשימה שלא התמודדה ב-2022 באותו שם מסומנת "—".</li>
<li>שכונות: חלוקת השכונות של ועדת הבחירות; השכונה נקבעת לפי מיקום הקלפי ולא לפי מקום המגורים.</li>
<li>ההצבעה חשאית. התוצאות הן ברמת הקלפי בלבד. אתר עצמאי ולא רשמי, ללא קשר לוועדת הבחירות. <a href="https://github.com/zozo123/kalpi-map">קוד ושיטה ב-GitHub</a>.</li></ul>"""

def city_page(c, name, S, nbs, rank, allc):
    slug = SLUGS.get(c, f"loc-{c}"); url = f"{SITE}city/{slug}.html"; img = f"{SITE}city/og/{slug}.png"
    top = S["rows"][0]
    title = f"איך הצביעו ב{name}? תוצאות הבחירות לכנסת ה-26 לפי קלפי"
    desc = (f"{name}: {fmt(S['kalpiot'])} קלפיות, {fmt(S['eligible'])} בעלי זכות בחירה, אחוז הצבעה בקלפיות {pct(S['turnout'])}. "
            f"הרשימה הגדולה ביישוב: {top['name']} ({pct(top['s'])}). השוואה ל-2022 ותוצאות לכל שכונה וקלפי.")
    rows = [r for r in S["rows"] if r["s"] >= 0.01]; mx = rows[0]["s"]
    tr = "".join(
        f'<tr><td><span class="sw" style="background:{r["color"]}"></span>{esc(r["name"])}</td><td class="n">{pct(r["s"])}</td>'
        f'<td class="b"><div class="bar"><i style="width:{r["s"]/mx*100:.1f}%;background:{r["color"]}"></i></div></td><td class="n">{fmt(r["v"])}</td>'
        f'<td class="n">{pct(r["s22"]) if r["s22"] is not None else "—"}</td>'
        f'<td class="n">{("+" if r["d"] > 0 else "") + f"{r["d"]*100:.1f}" if r["d"] is not None else ""}</td></tr>' for r in rows)
    other = S["valid"] - sum(r["v"] for r in rows)
    nb_html = ""
    if nbs:
        nb_html = ("<h2>לפי שכונה</h2><div class=\"card\"><table><thead><tr><th>שכונה</th><th>קולות כשרים 2026</th><th>הרשימה הגדולה</th><th>אחוז</th></tr></thead><tbody>" +
            "".join(f'<tr><td><a href="../?q={urllib.parse.quote(n["name"] + ", " + name)}">{esc(n["name"])}</a></td><td class="n">{fmt(n["valid"])}</td>'
                    f'<td><span class="sw" style="background:{n["color"]}"></span>{esc(n["lead"])}</td><td class="n">{pct(n["share"])}</td></tr>' for n in nbs) +
            '</tbody></table><div class="meta">לחיצה על שם שכונה פותחת אותה במפה, עם הקלפיות והשוואה ל-2022.</div></div>')
    others = "".join(f'<li><a href="{SLUGS.get(cc, f"loc-{cc}")}.html">{esc(nn)}</a></li>' for cc, nn in allc if cc != c)
    share_text = f"איך הצביעו ב{name} בבחירות לכנסת ה-26? תוצאות לפי קלפי ולפי שכונה, והשוואה ל-2022:"
    ld = {"@context": "https://schema.org", "@type": "Dataset", "name": title, "description": desc, "url": url, "inLanguage": "he",
          "license": "https://creativecommons.org/licenses/by-nc-sa/4.0/", "isAccessibleForFree": True,
          "spatialCoverage": {"@type": "Place", "name": name}, "temporalCoverage": "2026-10-27",
          "creator": {"@type": "Organization", "name": "kalpi-map (unofficial)", "url": SITE},
          "isBasedOn": ["https://github.com/harelc/elections-vote-transfer", "https://elections.govmap.gov.il/"]}
    return (head(title, desc, url, img) + f'<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script></head><body><main>'
        f'<div class="crumb"><a href="../">קלפיות ותוצאות לפי כתובת</a> › <a href="index.html">יישובים</a> › {esc(name)}</div>'
        f'<h1>איך הצביעו ב{esc(name)}?</h1><p class="meta">הבחירות לכנסת ה-26, 27 באוקטובר 2026 · היישוב ה-{rank} בגודלו לפי מספר בעלי זכות הבחירה</p>'
        f'<div class="card"><p>ב{esc(name)} היו {fmt(S["eligible"])} בעלי זכות בחירה ב-{fmt(S["kalpiot"])} קלפיות רגילות. הצביעו {fmt(S["voters"])} '
        f'(אחוז הצבעה בקלפיות {pct(S["turnout"])}, ללא מעטפות כפולות); {fmt(S["valid"])} קולות כשרים ו-{fmt(S["invalid"])} פסולים. '
        f'הרשימה הגדולה ביישוב: <b>{esc(top["name"])}</b> עם {pct(top["s"])} מהקולות הכשרים.</p>'
        f'<a class="cta" href="../?q={urllib.parse.quote(name)}">חפשו את הכתובת שלכם ב{esc(name)} ←</a>'
        f'<div class="meta">רואים את 5 הקלפיות הקרובות לכתובת, את השכונה, והשוואה ל-2022.</div></div>'
        f'<img class="og" src="og/{slug}.png" width="1200" height="630" alt="תוצאות הבחירות לכנסת ה-26 ב{esc(name)}: הרשימות הגדולות והשינוי מ-2022">'
        f'<h2>התוצאות ב{esc(name)}</h2><div class="card"><table><thead><tr><th>רשימה</th><th>2026</th><th class="b"></th><th>קולות</th><th>2022</th><th>שינוי (נק׳)</th></tr></thead><tbody>{tr}'
        f'<tr><td>אחרות (מתחת ל-1%)</td><td class="n">{pct(other / S["valid"])}</td><td></td><td class="n">{fmt(other)}</td><td></td><td></td></tr></tbody></table>'
        f'<div class="meta">אחוזים מהקולות הכשרים. 2022 לפי שיוך קלפיות (קירוב); "—" = לא התמודדה באותו שם ב-2022.</div></div>'
        f'<h2>שתפו</h2>{share_links(share_text, url)}{nb_html}<h2>יישובים נוספים</h2><ul class="cities">{others}</ul>{SOURCES}</main></body></html>\n')

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--top", type=int, default=50); ap.add_argument("--no-images", action="store_true")
    a = ap.parse_args()
    K, H, N = load(); P = K["parties"]
    by = collections.defaultdict(list); names = {}
    for b in K["b"]:
        by[b["c"]].extend(b["k"]); names[b["c"]] = b["t"]
    order = sorted(by, key=lambda c: -sum(k[2] for k in by[c]))[:a.top]
    allc = [(c, names[c]) for c in order]
    os.makedirs(os.path.join(ROOT, "city", "og"), exist_ok=True)
    foot = "מקור: ועדת הבחירות המרכזית, 31.10.2026 · קלפיות רגילות בלבד · 2022 לפי שיוך קלפיות (קירוב) · אתר עצמאי ולא רשמי"
    summary = []
    for i, c in enumerate(order, 1):
        S = summarize(by[c], K, H); slug = SLUGS.get(c, f"loc-{c}")
        open(os.path.join(ROOT, "city", slug + ".html"), "w", encoding="utf-8").write(city_page(c, names[c], S, neighborhoods(c, N, P), i, allc))
        if not a.no_images:
            og_image(os.path.join(ROOT, "city", "og", slug + ".png"), names[c], "איך הצביעו ביישוב?",
                     [f"{fmt(S['kalpiot'])} קלפיות · הצבעה בקלפיות {pct(S['turnout'])}", f"{fmt(S['valid'])} קולות כשרים"], S["rows"], foot)
        summary.append(dict(code=c, name=names[c], slug=slug, eligible=S["eligible"], voters=S["voters"], valid=S["valid"], turnout=round(S["turnout"], 4),
                            kalpiot=S["kalpiot"], top=[(r["name"], round(r["s"], 4), None if r["d"] is None else round(r["d"], 4)) for r in S["rows"][:6]]))
    # national (regular boxes only)
    allks = [k for c in by for k in by[c]]; NS = summarize(allks, K, H)
    if not a.no_images:
        og_image(os.path.join(ROOT, "og", "og-default.png"), "איך הצביעו לידכם?", "תוצאות לפי כתובת, קלפי ושכונה",
                 [f"{fmt(NS['kalpiot'])} קלפיות · {fmt(NS['eligible'])} בעלי זכות בחירה", "כל הקלפיות הרגילות בארץ"], NS["rows"], foot)
    # index + sitemap
    lis = "".join(f'<li><a href="{s["slug"]}.html">{esc(s["name"])}</a> <span class="meta">· {fmt(s["eligible"])} בעלי זכות · הצבעה בקלפיות {pct(s["turnout"])}</span></li>' for s in summary)
    t = "תוצאות הבחירות לכנסת ה-26 לפי יישוב"
    open(os.path.join(ROOT, "city", "index.html"), "w", encoding="utf-8").write(
        head(t, f"תוצאות הבחירות לכנסת ה-26 ב-{len(summary)} היישובים הגדולים, לפי קלפי ולפי שכונה, עם השוואה ל-2022.", f"{SITE}city/", f"{SITE}og/og-default.png") +
        f'</head><body><main><div class="crumb"><a href="../">קלפיות ותוצאות לפי כתובת</a> › יישובים</div><h1>{t}</h1>'
        f'<p class="meta">{len(summary)} היישובים הגדולים לפי מספר בעלי זכות הבחירה. לכל כתובת אחרת: <a href="../">חיפוש לפי כתובת</a>.</p><ol>{lis}</ol>{SOURCES}</main></body></html>\n')
    urls = [SITE, SITE + "city/"] + [f"{SITE}city/{s['slug']}.html" for s in summary]
    today = datetime.now().strftime("%Y-%m-%d")
    open(os.path.join(ROOT, "sitemap.xml"), "w").write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        "".join(f"  <url><loc>{u}</loc><lastmod>{today}</lastmod></url>\n" for u in urls) + "</urlset>\n")
    json.dump(dict(national=dict(kalpiot=NS["kalpiot"], eligible=NS["eligible"], voters=NS["voters"], valid=NS["valid"], invalid=NS["invalid"], turnout=round(NS["turnout"], 4),
                   valid22_crosswalk=NS["valid22"], top=[(r["name"], round(r["s"], 4), None if r["d"] is None else round(r["d"], 4)) for r in NS["rows"][:10]]), cities=summary),
              open(os.path.join(ROOT, "city", "stats.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"wrote {len(summary)} city pages, OG images, city/index.html, sitemap.xml, city/stats.json")

if __name__ == "__main__":
    main()
