#!/usr/bin/env python3
"""Download Knesset 26 polling-place and per-ballot-box result CSVs, join them on
the ballot-box ID (ברזל), group ballot boxes that share a building, and write
data/kalpiot26.json for the static site.

Usage:  python3 scripts/build_data.py            # download sources to raw/ and build
        python3 scripts/build_data.py --offline  # rebuild from files already in raw/
Requires Python 3.9+ (standard library only).
"""
import csv, io, json, sys, os, urllib.request, datetime, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "raw")
OUT = os.path.join(ROOT, "data", "kalpiot26.json")

SOURCES = {
    # Polling-place list with WGS84 coordinates (cached copy of the CEC/GovMap layer 243675)
    "polling_places.csv": "https://raw.githubusercontent.com/shaielc/Behirot/14361a10e8d93cf8d1096684b1a22f177c72f749/2026/polling_places.csv",
    # Per-ballot-box results, latest accepted CEC count, all 12,018 regular boxes (+ double-envelope boxes)
    "ballot26.csv": "https://raw.githubusercontent.com/harelc/elections-vote-transfer/6b7f32196430051ec8f83a90e46430c494d8501a/ballot26.csv",
    # Mirror of the CEC expb.csv (snapshot of 28 Oct 2026, partial: ~11,168 boxes) - used only as a cross-check
    "expb.csv": "https://raw.githubusercontent.com/shaielc/Behirot/14361a10e8d93cf8d1096684b1a22f177c72f749/2026/expb.csv",
    # Snapshot metadata for ballot26.csv (CEC "as_of" timestamp, roster completeness)
    "k26_status.json": "https://raw.githubusercontent.com/harelc/elections-vote-transfer/6b7f32196430051ec8f83a90e46430c494d8501a/site/data/k26_status.json",
}

# Ballot letters -> list names, from the CEC list of lists for the 26th Knesset
# (https://www.gov.il/he/pages/candidates-lists-26, approved 27.9.2026).
# [short name, full official name]
PARTIES = {
    "מחל": ["הליכוד", "הליכוד בהנהגת בנימין נתניהו לראשות הממשלה"],
    "דרך": ["ישר!", "ישר! עם איזנקוט לראשות הממשלה מאחדים את ישראל"],
    "רק": ["ביחד", "ביחד בראשות נפתלי בנט"],
    "אמת": ["הדמוקרטים", "הדמוקרטים בראשות יאיר גולן"],
    "ל": ["ישראל ביתנו", "ישראל ביתנו בראשות אביגדור ליברמן"],
    "ודם": ["הרשימה המשותפת", "הרשימה המשותפת"],
    "ג": ["יהדות התורה", "יהדות התורה והשבת אגודת ישראל – דגל התורה"],
    "שס": ["ש\"ס", "התאחדות הספרדים שומרי תורה תנועתו של מרן הרב עובדיה יוסף זצ\"ל"],
    "ב": ["עוצמה יהודית", "עוצמה יהודית בראשות איתמר בן גביר"],
    "ט": ["הציונות הדתית", "הציונות הדתית בראשות בצלאל סמוטריץ' וזהות בראשות משה פייגלין"],
    "עם": ["רע\"ם", "רע\"ם – הרשימה הערבית המאוחדת"],
    "ך": ["עמך ישראל", "עמך ישראל בראשות עופר וינטר"],
    "די": ["המילואימניקים והכלכלית", "המילואימניקים והכלכלית בראשות יועז הנדל וירון זליכה"],
    "זך": ["הציבור החרדי", "הציבור החרדי בראשות מוטי ליטנר"],
    "ני": ["נעם", "נעם לישראל למען עתיד הילדים בראשות אבי מעוז"],
    "י": ["ישראל תחילה", "ישראל תחילה בראשות שרן השכל"],
    "ז": ["בטח", "בטח – בטחון חברתי בראשות סמיון גרפמן"],
    "בד": ["ביחד נצליח", "מפלגת ביחד נצליח – רשימה משותפת ערבית יהודית בראשות אבי שקד"],
    "בי": ["צומת בית ישראל", "צומת בית ישראל"],
    "בקר": ["אורות השחר", "אורות השחר בראשות ניסים לוק"],
    "ד": ["השותפות לכולם", "השותפות לכולם"],
    "ה": ["גן עדן", "גן עדן בראשות ישוע ישראל בן דוד"],
    "זץ": ["ברית עולם", "ברית עולם לגאולת ישראל"],
    "יק": ["גה\"ת", "גה\"ת – גוש התנ\"כי"],
    "כן": ["כחול לבן (לא התמודדה)", "כחול לבן בראשות בני גנץ – הרשימה אינה מתמודדת בבחירות לכנסת ה-26"],
    "נף": ["שמע", "שמע בראשות נפתלי גולדמן"],
    "נץ": ["ביטחון אישי", "ביטחון אישי"],
    "נקי": ["התיקון", "התיקון לשיטת הבחירות והממשל"],
    "נר": ["צבע שחור", "צבע שחור – מגן עולם התורה"],
    "פה": ["אני ואתה", "אני ואתה מפלגת העם הישראלית"],
    "צבי": ["תנועת אח\"י (לא התמודדה)", "תנועת אחי תנועתו של הרב יורם אברג'ל זצ\"ל – הרשימה אינה מתמודדת בבחירות לכנסת ה-26"],
    "צדק": ["שרשר", "שרשר לאהבה ואחדות העם"],
    "צף": ["הפיראטים", "הפיראטים – צפים לטוב"],
    "ק": ["תקומה", "תקומה"],
    "קה": ["קול הנשים", "קול הנשים"],
    "קך": ["סדר חדש", "סדר-חדש לכינון חוקה, להפרדת רשויות ולבחירות אישיות"],
    "קץ": ["משפט צדק", "משפט צדק"],
    "רץ": ["הקהל", "הקהל – מפלגה כלל חרדית שנציגיה נבחרים על ידי הציבור בראשות הרב שלמה אלבוים"],
}
# English names and display colors (colors: editorial palette after RavBogard/israelielection; gray = no editorial color)
PARTY_EN_COLOR = {
 "אמת": [
  "The Democrats",
  "#a72f65"
 ],
 "ב": [
  "Otzma Yehudit",
  "#514394"
 ],
 "בד": [
  "Together We Succeed — Arab–Jewish Joint List",
  "#8c939b"
 ],
 "בי": [
  "Tzomet Beit Yisrael",
  "#8c939b"
 ],
 "בקר": [
  "Lights of Dawn",
  "#8c939b"
 ],
 "ג": [
  "United Torah Judaism",
  "#65adb5"
 ],
 "ד": [
  "Partnership for Everyone",
  "#8c939b"
 ],
 "די": [
  "Reservists–Economic",
  "#b48727"
 ],
 "דרך": [
  "Yashar! with Eisenkot",
  "#ed9859"
 ],
 "ה": [
  "Garden of Eden",
  "#8c939b"
 ],
 "ודם": [
  "Joint List",
  "#267b44"
 ],
 "ז": [
  "Betach — Social Security",
  "#8c939b"
 ],
 "זך": [
  "The Haredi Public",
  "#8c939b"
 ],
 "זץ": [
  "Brit Olam — Redemption of Israel",
  "#8c939b"
 ],
 "ט": [
  "Religious Zionism–Zehut",
  "#7d67b3"
 ],
 "י": [
  "Israel First",
  "#8c939b"
 ],
 "יק": [
  "Gush HaTanakhi — Biblical Bloc",
  "#8c939b"
 ],
 "ך": [
  "People of Israel",
  "#597fbd"
 ],
 "כן": [
  "Blue and White",
  "#db7898"
 ],
 "ל": [
  "Yisrael Beiteinu",
  "#9e3826"
 ],
 "מחל": [
  "Likud",
  "#245b94"
 ],
 "ני": [
  "Noam for Israel",
  "#b29bda"
 ],
 "נף": [
  "Shema",
  "#8c939b"
 ],
 "נץ": [
  "Personal Security",
  "#8c939b"
 ],
 "נקי": [
  "Repairing the Electoral and Government System",
  "#8c939b"
 ],
 "נר": [
  "Black Color — Defender of the Torah World",
  "#8c939b"
 ],
 "עם": [
  "Ra'am — United Arab List",
  "#80b667"
 ],
 "פה": [
  "You and Me — Israeli People's Party",
  "#8c939b"
 ],
 "צבי": [
  "Achi Movement",
  "#8c939b"
 ],
 "צדק": [
  "Sharshar — Love and National Unity",
  "#8c939b"
 ],
 "צף": [
  "The Pirates — Floating for Good",
  "#8c939b"
 ],
 "ק": [
  "Tekuma",
  "#8c939b"
 ],
 "קה": [
  "Women's Voice",
  "#8c939b"
 ],
 "קך": [
  "New Order — Constitution, Separation of Powers and Personal Elections",
  "#8c939b"
 ],
 "קץ": [
  "Mishpat Tzedek — Just Judgment",
  "#8c939b"
 ],
 "רץ": [
  "HaKahal — Publicly Chosen Haredi Representatives",
  "#8c939b"
 ],
 "רק": [
  "B'Yachad — Together",
  "#ce542d"
 ],
 "שס": [
  "Shas",
  "#147c88"
 ]
}
META_COLS = {"סמל ועדה", "ברזל", "שם ישוב", "סמל ישוב", "קלפי", "ריכוז", "שופט", "בזב",
             "מצביעים", "פסולים", "כשרים", "חיצוניות", "קלפי אחרת", ""}


def fetch(name):
    path = os.path.join(RAW, name)
    if "--offline" not in sys.argv:
        os.makedirs(RAW, exist_ok=True)
        req = urllib.request.Request(SOURCES[name], headers={"User-Agent": "kalpi-map-build"})
        with urllib.request.urlopen(req, timeout=120) as r, open(path, "wb") as f:
            f.write(r.read())
    with open(path, encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def fetch_json(name):
    path = os.path.join(RAW, name)
    if "--offline" not in sys.argv:
        req = urllib.request.Request(SOURCES[name], headers={"User-Agent": "kalpi-map-build"})
        with urllib.request.urlopen(req, timeout=60) as r, open(path, "wb") as f:
            f.write(r.read())
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def num(x):
    x = (x or "").strip()
    return int(float(x)) if x else 0


def clean(s):
    return " ".join((s or "").replace(",", ", ").split()).replace(" ,", ",").strip(" ,")


def main():
    places = fetch("polling_places.csv")
    results = fetch("ballot26.csv")
    try:
        expb = fetch("expb.csv")
    except Exception as e:  # cross-check only
        print("expb.csv not available:", e); expb = []

    try:
        status = fetch_json("k26_status.json")
    except Exception as e:
        print("k26_status.json not available:", e); status = {}
    party_cols = [c for c in results[0].keys() if c not in META_COLS]
    unknown = [c for c in party_cols if c not in PARTIES]
    codes = sorted(party_cols, key=lambda c: -sum(num(r[c]) for r in results))
    res_by_id = {r["ברזל"].strip(): r for r in results}

    buildings = collections.OrderedDict()
    unmatched, n_k = [], 0
    for p in places:
        bid = p["ברזל"].strip()
        r = res_by_id.get(bid)
        if r is None:
            unmatched.append(bid); continue
        lat, lon = round(float(p["קו רוחב"]), 5), round(float(p["קו אורך"]), 5)
        key = (lat, lon, clean(p["שם ישוב בחירות"]), clean(p["מקום קלפי"]), clean(p["כתובת קלפי"]))  # one point can host several venues/localities
        b = buildings.get(key)
        if b is None:
            b = buildings[key] = {"y": lat, "x": lon, "c": int(num(p["סמל ישוב בחירות"])), "t": clean(p["שם ישוב בחירות"]),
                                  "a": clean(p["כתובת קלפי"]), "v": clean(p["מקום קלפי"]), "k": []}
        votes = []
        for i, c in enumerate(codes):
            v = num(r[c])
            if v:
                votes += [i, v]
        kn = p["סמל קלפי"].strip()
        kn = kn[:-2] if kn.endswith(".0") else kn
        b["k"].append([int(bid), kn, num(r["בזב"]), num(r["מצביעים"]), num(r["פסולים"]),
                       1 if p.get("נגישה", "").strip() == "כן" else 0, votes])
        n_k += 1

    # Cross-check against the CEC expb mirror
    diffs = 0
    for e in expb:
        r = res_by_id.get(e["ברזל"].strip())
        if r and any(num(r[c]) != num(e.get(c)) for c in ["בזב", "מצביעים", "כשרים"] + codes if c in e):
            diffs += 1

    out = {
        "built": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "source_as_of": status.get("as_of"),
        "source_kind": status.get("kind"),
        "parties": [[c, PARTIES.get(c, [c, c])[0], PARTIES.get(c, [c, c])[1],
                     PARTY_EN_COLOR.get(c, [c, "#8c939b"])[0], PARTY_EN_COLOR.get(c, [c, "#8c939b"])[1]] for c in codes],
        "b": list(buildings.values()),
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    double_env = sum(1 for r in results if r["ברזל"].strip() not in {p["ברזל"].strip() for p in places})
    stats = {
        "polling_places": len(places), "result_rows": len(results), "joined_kalpiot": n_k,
        "buildings": len(buildings), "unmatched_places": unmatched,
        "result_rows_without_location (double envelopes etc.)": double_env,
        "unknown_party_codes": unknown, "expb_mirror_rows": len(expb),
        "expb_rows_differing_from_latest": diffs,
        "eligible": sum(num(r["בזב"]) for r in results), "voters": sum(num(r["מצביעים"]) for r in results),
        "json_bytes": os.path.getsize(OUT), "source_status": status,
    }
    with open(os.path.join(ROOT, "data", "build_stats.json"), "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=1)
    print(json.dumps(stats, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
