# קלפיות ותוצאות לפי כתובת · Kalpi map, Knesset 26

**אתר:** https://zozo123.github.io/kalpi-map/

[עברית](#עברית) · [English](#english)

---

## עברית

מקלידים כתובת בישראל ומקבלים את 5 מקומות הקלפי הקרובים, ואיך הצביעו בכל קלפי בבחירות לכנסת ה-26 (27 באוקטובר 2026).

### מה האתר עושה
- איתור הכתובת נעשה בדפדפן, בשלבים: (1) מנוע החיפוש של אתר הבחירות של ועדת הבחירות (elections.govmap.gov.il). כתובת מתקבלת רק אם הרחוב, מספר הבית והיישוב זהים למה שהוקלד, והרחוב מופיע ברשימת הרחובות הרשמית של היישוב (data.gov.il, מאגר 321); כך נחסמות החלפות כמו הרצל→אצ"ל. (2) Nominatim (`countrycodes=il,ps`) חופשי ואז מובנה ומוגבל ליישוב, (3) בלי "שדרות", (4) Photon, (5) GovMap (רק התאמה מלאה של רחוב ומספר), (6) מרכז היישוב או כתובת קלפי תואמת. מידת הדיוק מוצגת תמיד.
- כשהיישוב של הכתובת ידוע, המועמדות הן רק קלפיות של אותו יישוב (שם מצביעים התושבים). בחיפוש שכונה, קלפיות השכונה קודמות.
- כרטיס שכונה (חלוקת השכונות של ועדת הבחירות) עם תוצאות 2026 והשוואה ל-2022 ו-2021 באחוזים, וכרטיס אזור סטטיסטי של הלמ"ס עם האשכול החברתי-כלכלי.
- לכל מקום קלפי: השוואה ל-2022 ו-2021 לפי שם הרשימה, באחוזים בלבד, עם סימון איכות ההתאמה (מדויקת / לפי מקום / "משוערת" / יישוב חדש).
- שכבות מפה (נטענות רק לפי בחירה): הרשימה המובילה או אחוז לרשימה לפי שכונה או לפי אזור סטטיסטי, ואשכול חברתי-כלכלי.
- אפשר גם ללחוץ על המפה או להשתמש ב"המיקום שלי".
- מוצגים 5 מקומות הקלפי (מבנים) הקרובים בקו אוויר. קלפיות באותו מבנה (אותן קואורדינטות) מקובצות יחד: סך הכול למבנה, ופירוט לכל קלפי.
- לכל קלפי: בעלי זכות בחירה, מצביעים, אחוז הצבעה, קולות כשרים ופסולים, וחלוקת הקולות. רשימות מתחת ל-1% מקובצות ב"אחרות".
- קישור לשיתוף: `?q=<כתובת>`.

### מגבלות, חשוב לקרוא
- ההצבעה חשאית. התוצאות הן ברמת הקלפי בלבד.
- כל בוחר משובץ לפי הכתובת הרשומה במרשם האוכלוסין, לא לפי קרבה. "הקלפי הקרובה" היא הערכה. את הקלפי שלכם בודקים ב-https://www.gov.il/apps/moin/bocharim/
- קולות המעטפות הכפולות (908 "קלפיות" ללא מיקום) אינם מוצגים.
- גרסת הנתונים: תמונת מצב רשמית של ועדת הבחירות המרכזית מ-31.10.2026 12:27 שעון ישראל (`as_of` 2026-10-31T10:27:49Z, כפי שנשמרה ב-harelc בקומיט `6b7f321`). כל 12,018 הקלפיות הרגילות נספרו וכל 908 קלפיות המעטפות החיצוניות נקלטו. ייתכנו הבדלים קטנים מהפרסום הסופי הרשמי.
- החיבור נבדק מול חיבור עצמאי (kalpiot26.json של בודק נפרד): כל 12,018 הקלפיות זהות במספר קלפי (כמחרוזת, "x.10" שונה מ-"x.1"), בעלי זכות, מצביעים, כשרים, קולות לכל רשימה, יישוב, מקום וכתובת. An independent join was cross-checked: all 12,018 kalpiot are identical.
- מיפוי אותיות הרשימות (38 אותיות) אומת מול פתקי ההצבעה המאושרים של ועדת הבחירות (Approved Voting Slips). הצבעים לפי הפלטה של RavBogard/israelielection.
- Data version: official CEC snapshot as of 2026-10-31 12:27 Israel time (10:27:49 UTC), via harelc commit `6b7f321`; all 12,018 regular boxes and 908 external-envelope boxes counted. Small differences from the final official publication are possible. The CEC's own media26 expb.csv blocks automated downloads, so it is not fetched directly.
- Nominatim לא תמיד מכיר מספרי בית בישראל; במקרה כזה מוצג הרחוב, וזה מופיע בשורת הסטטוס.

### מקורות
- תוצאות לפי קלפי: ועדת הבחירות המרכזית (`expb.csv`), דרך [harelc/elections-vote-transfer](https://github.com/harelc/elections-vote-transfer) `ballot26.csv` (CC BY-NC-SA 4.0). הצלבה מול העותק ב-[shaielc/Behirot](https://github.com/shaielc/Behirot) `2026/expb.csv`.
- מקומות קלפי וקואורדינטות: [GovMap שכבה 243675](https://www.govmap.gov.il/?lay=243675), דרך `2026/polling_places.csv` ב-shaielc/Behirot.
- שכונות ותוצאות לפי שכונה 2022/2021, ומנוע החיפוש: [אתר הבחירות של ועדת הבחירות / GovMap](https://elections.govmap.gov.il/). רשימת רחובות: רשות האוכלוסין, [data.gov.il מאגר 321](https://data.gov.il/dataset/321).
- אזורים סטטיסטיים 2022 ומדד חברתי-כלכלי 2021: [הלמ"ס](https://www.cbs.gov.il/he/Pages/geo-layers.aspx) (רישיון פתוח, גבולות מפושטים). בכ-22% מהאזורים המיושבים אין קלפי.
- שיוך קלפיות ל-2022/2021: harelc/elections-vote-transfer.
- שמות הרשימות: [רשימות המועמדים לכנסת ה-26](https://www.gov.il/he/pages/candidates-lists-26), ועדת הבחירות המרכזית.
- מפה © תורמי OpenStreetMap, Leaflet. צבעי הרשימות בהשראת [RavBogard/israelielection](https://github.com/RavBogard/israelielection).

אתר עצמאי ולא רשמי.

---

## English

Type an Israeli street address and get the 5 nearest polling places and how each ballot box (kalpi) voted in the 26th Knesset election (27 Oct 2026).

### How it works
1. `scripts/build_data.py` (Python 3, standard library only) downloads, at pinned commits:
   - `polling_places.csv`: the 12,018 Knesset 26 ballot boxes with WGS84 lon/lat, address and venue (CEC / GovMap layer 243675, cached by shaielc/Behirot);
   - `ballot26.csv`: per-ballot-box results, latest accepted CEC count (harelc/elections-vote-transfer, updated 31 Oct 2026);
   - `expb.csv`: a 28 Oct snapshot of the CEC file (shaielc/Behirot), used only as a cross-check.
2. It joins places and results on the ballot-box ID (`ברזל`), groups boxes that share coordinates (rounded to 5 decimals, about 1 m) into buildings, and writes `data/kalpiot26.json` plus `data/build_stats.json`.
3. `index.html` + `app.js` load the JSON and geocode in the browser. Chain: CEC election search API (`d3i80z2x83yp3b.cloudfront.net/search`, CORS `*`; an address is accepted only when street, house number and locality code equal the query and the street is on the official street list for that locality, fetched from the data.gov.il datastore, dataset 321) → Nominatim free text → Nominatim structured, bounded to the city → without "שדרות" → Photon (Israel bbox) → GovMap autocomplete (exact street + number only) → settlement centroid / matching polling-place address. One request per step, at most 1 request/second per host, cached, no search-as-you-type, no custom headers. Precision is always shown.
4. Candidates are restricted to the geocoded locality (CBS code); a neighborhood search (CEC `h`) puts that neighborhood's kalpiot first. The 5 nearest buildings are shown with totals and per-box results.
5. Lazy-loaded v2 data, built by `scripts/build_v2.py` and `scripts/build_nb.py` (`scripts/fetch_cec_neighborhoods.sh` vendors the CEC files, which have no CORS):
   - `data/hist.json`: K25/K24 results attached to each K26 kalpi (harelc crosswalk), shown as shares only. Entries that repeat a building or locality sum are stored once and never summed twice. Match quality: exact / venue = reliable, nearest = "approximate", none = new.
   - `data/nb.json`, `data/nb.topo.json`: the 2,435 CEC neighborhoods. K26 totals are recomputed from our kalpiot by point-in-polygon of the kalpi location (11,956 of 12,018 kalpiot fall inside; 2,387 of 2,417 neighborhoods match the CEC valid-vote total exactly, the rest differ by external-envelope handling). K25/K24 come from the CEC neighborhood files, joined by UNIQ_ID or by settlement + name.
   - `data/sa.json`, `data/statareas.geojson`: CBS 2022 statistical areas (simplified) with K26 totals and the 2021 SES cluster.

Ballot letters map to list names from the CEC list of lists (gov.il `candidates-lists-26`, approved 27 Sep 2026). All 38 letter codes in the results file are mapped.

### Rebuild
```bash
python3 scripts/build_data.py          # downloads sources into raw/ (git-ignored) and rebuilds data/
python3 scripts/build_data.py --offline  # rebuild from raw/
python3 -m http.server 8000            # then open http://localhost:8000
```
To pick up a newer count, update the pinned commit URLs in `SOURCES` at the top of the script.

### Data JSON format
`{"built", "parties": [[letters, short name, full name], ...], "b": [building, ...]}`; each building is
`{"y": lat, "x": lon, "t": locality, "a": address, "v": venue, "k": [[ballotId, kalpiNo, eligible, voters, invalid, accessible, [partyIdx, votes, ...]], ...]}`.

### Limits
- The vote is secret; results exist per ballot box only.
- Voters are assigned by registered address, not proximity, so "nearest" is an estimate. The official lookup by ID number is https://www.gov.il/apps/moin/bocharim/
- Double-envelope votes (soldiers, diplomats, prisoners, hospitals; 908 rows with no location) are excluded.
- Results are the latest accepted count as of 31 Oct 2026 and may differ slightly from the final official publication.

### Licenses
Code: MIT. Derived data: CC BY-NC-SA 4.0 (share-alike with harelc's `ballot26.csv`). CBS statistical areas and SES: CBS open licence, boundaries simplified. CEC neighborhoods: Central Elections Committee / GovMap (terms unstated; attributed). Street list: Population Authority via data.gov.il. Raw source CSVs are not redistributed; the script downloads them. Unofficial project, not affiliated with the Central Elections Committee.
