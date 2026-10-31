# קלפיות ותוצאות לפי כתובת · Kalpi map, Knesset 26

**אתר:** https://zozo123.github.io/kalpi-map/

[עברית](#עברית) · [English](#english)

---

## עברית

מקלידים כתובת בישראל ומקבלים את 5 מקומות הקלפי הקרובים, ואיך הצביעו בכל קלפי בבחירות לכנסת ה-26 (27 באוקטובר 2026).

### מה האתר עושה
- איתור הכתובת נעשה בדפדפן מול [Nominatim](https://nominatim.org/) של OpenStreetMap (`countrycodes=il`, `accept-language=he`). אם לא נמצאה תוצאה, האתר מנסה שוב בלי "רחוב/שדרות" ובלי מספר הבית. אם השירות לא זמין או שאין התאמה, החיפוש עובר לכתובות של מקומות הקלפי עצמם (יישוב ואז רחוב).
- אפשר גם ללחוץ על המפה או להשתמש ב"המיקום שלי".
- מוצגים 5 מקומות הקלפי (מבנים) הקרובים בקו אוויר. קלפיות באותו מבנה (אותן קואורדינטות) מקובצות יחד: סך הכול למבנה, ופירוט לכל קלפי.
- לכל קלפי: בעלי זכות בחירה, מצביעים, אחוז הצבעה, קולות כשרים ופסולים, וחלוקת הקולות. רשימות מתחת ל-1% מקובצות ב"אחרות".
- קישור לשיתוף: `?q=<כתובת>`.

### מגבלות, חשוב לקרוא
- ההצבעה חשאית. התוצאות הן ברמת הקלפי בלבד.
- כל בוחר משובץ לפי הכתובת הרשומה במרשם האוכלוסין, לא לפי קרבה. "הקלפי הקרובה" היא הערכה. את הקלפי שלכם בודקים ב-https://www.gov.il/apps/moin/bocharim/
- קולות המעטפות הכפולות (908 "קלפיות" ללא מיקום) אינם מוצגים.
- גרסת הנתונים: תמונת מצב רשמית של ועדת הבחירות המרכזית מ-31.10.2026 12:27 שעון ישראל (`as_of` 2026-10-31T10:27:49Z, כפי שנשמרה ב-harelc בקומיט `6b7f321`). כל 12,018 הקלפיות הרגילות נספרו וכל 908 קלפיות המעטפות החיצוניות נקלטו. ייתכנו הבדלים קטנים מהפרסום הסופי הרשמי.
- מיפוי אותיות הרשימות (38 אותיות) אומת מול פתקי ההצבעה המאושרים של ועדת הבחירות (Approved Voting Slips). הצבעים לפי הפלטה של RavBogard/israelielection.
- Data version: official CEC snapshot as of 2026-10-31 12:27 Israel time (10:27:49 UTC), via harelc commit `6b7f321`; all 12,018 regular boxes and 908 external-envelope boxes counted. Small differences from the final official publication are possible. The CEC's own media26 expb.csv blocks automated downloads, so it is not fetched directly.
- Nominatim לא תמיד מכיר מספרי בית בישראל; במקרה כזה מוצג הרחוב, וזה מופיע בשורת הסטטוס.

### מקורות
- תוצאות לפי קלפי: ועדת הבחירות המרכזית (`expb.csv`), דרך [harelc/elections-vote-transfer](https://github.com/harelc/elections-vote-transfer) `ballot26.csv` (CC BY-NC-SA 4.0). הצלבה מול העותק ב-[shaielc/Behirot](https://github.com/shaielc/Behirot) `2026/expb.csv`.
- מקומות קלפי וקואורדינטות: [GovMap שכבה 243675](https://www.govmap.gov.il/?lay=243675), דרך `2026/polling_places.csv` ב-shaielc/Behirot.
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
3. `index.html` + `app.js` load the JSON, geocode the address in the browser with Nominatim (`countrycodes=il`, `accept-language=he`, at most 1 request per second, retries without street prefix and house number), compute great-circle distances and show the 5 nearest buildings on a Leaflet/OSM map, with building totals and per-box results. If geocoding fails, it falls back to matching the locality and street against the polling-place addresses.

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
Code: MIT. Derived data: CC BY-NC-SA 4.0 (share-alike with harelc's `ballot26.csv`). Raw source CSVs are not redistributed; the script downloads them. Unofficial project, not affiliated with the Central Elections Committee.
