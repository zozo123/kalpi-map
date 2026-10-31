/*! kalpi-geocode.js: static, client-side Hebrew geocoder for Israel (kalpi-map).
 * Data: geo/loc.json + geo/<locality>.json shards built by build/build_index.py from
 *   © OpenStreetMap contributors (ODbL 1.0), data.gov.il street list (dataset 321), Tel Aviv-Yafo GIS (layer 527),
 *   CEC neighborhood polygons. Show "© OpenStreetMap contributors" wherever results are shown.
 * No dependencies, ES5 (runs in old Safari/Android WebViews and in Node >= 18 for tests).
 *
 *   var geo = KalpiGeo.create({ base: "https://cdn.jsdelivr.net/gh/zozo123/kalpi-map@<sha>/geo/" });
 *   geo.search("שדרות התמרים 10, אילת").then(function (r) { r && map.setView([r.lat, r.lon]) });
 *   // r = {lat, lon, prec: "house"|"interp"|"street"|"neighborhood"|"settlement", label, c, cname, street, num,
 *   //      score (0..1 street match), fuzzy, needRemote (true when the local answer is coarser than asked), src:"local"}
 *
 *   var q = KalpiGeo.remoteQueue();   // drop-in replacement for app.js throttled(host, url, opts)
 */
(function (root) {
  "use strict";
  // ---------------- Hebrew text normalization ----------------
  var FIN = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
  var TYPE = { "רחוב": 1, "רח": 1, "שדרות": 1, "שד": 1, "שדרת": 1, "סמטת": 1, "סמ": 1, "סמטה": 1, "כיכר": 1, "ככר": 1,
    "דרך": 1, "שביל": 1, "משעול": 1, "מעבר": 1, "טיילת": 1 };
  function clean(s) {
    return String(s || "").replace(/[\u0591-\u05C7]/g, "").replace(/[״“”]/g, '"').replace(/[׳‘’`]/g, "'").replace(/[–—־]/g, "-")
      .replace(/\s+/g, " ").trim();
  }
  function toks(s) {
    return clean(s).replace(/["'\-,.()\/\\]/g, " ").replace(/[ךםןףץ]/g, function (c) { return FIN[c]; }).toLowerCase()
      .split(" ").filter(Boolean);
  }
  var CANON = { "רחוב": "", "רח": "", "שד": "שדרות", "שדרת": "שדרות", "ככר": "כיכר", "סמ": "סמטה", "סמטת": "סמטה" };
  function core(t) { var c = t.filter(function (x) { return !TYPE[x]; }); return c.length ? c : t; }
  // skeleton: drop matres lectionis (ו י א), fold common transliteration pairs, drop the article ה on long tokens
  // and the Arabic article (א / אל / a-, al-, el-) so "צלאח א-דין" == "סלאח אל-דין" == "צאלח א-דין"
  var ARTICLE = { "א": 1, "אל": 1, "a": 1, "al": 1, "el": 1, "e": 1 };
  function skTok(x) {
    if (ARTICLE[x]) return "";
    if (x.length >= 4 && x[0] === "ה") x = x.slice(1);
    else if (x.length >= 5 && x[0] === "א" && x[1] === "ל") x = x.slice(2);
    return x.replace(/[ויא]/g, "").replace(/[צש]/g, "ס").replace(/ט/g, "ת").replace(/כ/g, "ק").replace(/ע/g, "");
  }
  // k: full key with canonical type words ("כיכר דיזנגוף" != "דיזנגוף"); c: core key without type words; sk: skeleton of core
  function keys(name) {
    var all = toks(name), t = core(all), s = t.slice().sort();
    var full = all.map(function (x) { return CANON.hasOwnProperty(x) ? CANON[x] : x; }).filter(Boolean).sort();
    var sk = t.map(skTok).filter(Boolean);
    return { t: t, k: full.join(" "), c: s.join(" "), sk: sk.slice().sort().join(""), skt: sk };
  }
  function dl(a, b, max) { // Damerau-Levenshtein with early exit
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var d = [], i, j;
    for (i = 0; i <= a.length; i++) { d[i] = [i]; }
    for (j = 0; j <= b.length; j++) d[0][j] = j;
    for (i = 1; i <= a.length; i++) {
      var rowMin = 1e9;
      for (j = 1; j <= b.length; j++) {
        var c = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        if (d[i][j] < rowMin) rowMin = d[i][j];
      }
      if (rowMin > max) return max + 1;
    }
    return d[a.length][b.length];
  }
  var HEB = { "א": 1, "ב": 2, "ג": 3, "ד": 4, "ה": 5, "ו": 6, "ז": 7, "ח": 8, "ט": 9, "י": 10, "כ": 20, "ך": 20, "ל": 30, "מ": 40, "ם": 40,
    "נ": 50, "ן": 50, "ס": 60, "ע": 70, "פ": 80, "ף": 80, "צ": 90, "ץ": 90, "ק": 100, "ר": 200, "ש": 300, "ת": 400 };
  function hebNum(tok) { // "נ'" -> 50, "קכ\"ג" -> 123; requires a geresh/gershayim so plain words are never numbers
    if (!/['"]/.test(tok)) return null;
    var t = tok.replace(/["']/g, "");
    if (!t || t.length > 3) return null;
    var n = 0; for (var i = 0; i < t.length; i++) { if (!HEB[t[i]]) return null; n += HEB[t[i]]; }
    return n;
  }

  // Manual locality aliases (abbreviations and former names) -> CBS code
  var LOC_ALIAS = { 'ת"א': 5000, "תא": 5000, "תל אביב": 5000, "תל-אביב": 5000, "יפו": 5000, "tel aviv": 5000, "תל אביב יפו": 5000,
    'י-ם': 3000, "ים": 3000, "jerusalem": 3000, 'ב"ש': 9000, "בש": 9000, 'פ"ת': 7900, "פת": 7900, "פתח תקוה": 7900,
    'ראשל"צ': 8300, "ראשלצ": 8300, "ראשון": 8300, 'ק"ש': 2800, 'ק"ג': 2630, 'ק"א': 6800, 'ר"ג': 8600, "רג": 8600, 'ב"ב': 6100, "בב": 6100,
    "נצרת עילית": 1061, "מודיעין": 1200, "מודיעין מכבים רעות": 1200, "בנימינה": 9800, "haifa": 4000, 'כ"ס': 6900, 'ר"ע': 2640,
    "הרצליה פיתוח": 6400, "נוף הגליל": 1061, "אום אל פאחם": 2710, "אום אל פחם": 2710 };
  var LOC_PREFIX = /^(מושב|המושב|קיבוץ|הקיבוץ|קבוץ|יישוב|ישוב|היישוב|העיר|עיר|כפר הנוער)\s+/;

  function parseNumber(streetPart) {
    // returns {street, num:int|null, suf:"א"|""}
    var s = " " + streetPart + " ", m, num = null, suf = "";
    s = s.replace(/\s(דירה|דיר|כניסה|קומה|ת\.?ד\.?|מיקוד)\s*\S+/g, " ").replace(/\b\d{5,7}\b/g, " ");
    m = s.match(/\s(\d{1,4})\s*([א-ת])?(?:\s*\/\s*\d+)?(?=\s)/);
    if (m) {
      num = +m[1]; suf = m[2] && (s[m.index + m[0].length] === " ") ? m[2] : "";
      s = s.slice(0, m.index) + " " + s.slice(m.index + m[0].length);
    } else {
      var t = s.trim().split(" ");
      for (var i = t.length - 1; i >= 1; i--) { var n = hebNum(t[i]); if (n) { num = n; t.splice(i, 1); s = t.join(" "); break; } }
    }
    return { street: s.replace(/\s+/g, " ").trim(), num: num, suf: suf };
  }

  function create(opt) {
    opt = opt || {};
    var base = opt.base || "geo/", fetchFn = opt.fetch || (typeof fetch !== "undefined" ? fetch.bind(root) : null);
    var indexP = null, IDX = null, shardP = {}, bucketP = {};
    function getJSON(path) {
      return fetchFn(base + path).then(function (r) { if (!r.ok) throw new Error(path + " " + r.status); return r.json(); });
    }
    function index() {
      if (indexP) return indexP;
      indexP = getJSON("loc.json").then(function (d) {
        var byKey = {}, bySk = {}, byCode = {};
        function add(name, L, w) {
          var k = keys(name);
          if (!k.k) return;
          if (!byKey[k.k] || byKey[k.k].w < w) byKey[k.k] = { L: L, w: w };
          if (!bySk[k.sk] || bySk[k.sk].w < w) bySk[k.sk] = { L: L, w: w };
        }
        d.l.forEach(function (r) {
          var L = { c: r[0], n: r[1], lat: r[2], lon: r[3], has: r[5] };
          byCode[L.c] = L;
          var forms = [L.n].concat(L.n.split(/\s+-\s+/), [L.n.replace(/\s*\(.*?\)\s*/g, " ")]);
          forms.forEach(function (f) { add(f, L, 3); });
          (r[4] || []).forEach(function (a) { add(a, L, 1); });
        });
        Object.keys(LOC_ALIAS).forEach(function (a) { var L = byCode[LOC_ALIAS[a]]; if (L) add(a, L, 4); });
        IDX = { byKey: byKey, bySk: bySk, byCode: byCode, list: d.l };
        return IDX;
      });
      indexP["catch"](function () { indexP = null; });
      return indexP;
    }
    function findLoc(text) {
      var raw = clean(text).replace(LOC_PREFIX, "");
      if (!raw) return null;
      var direct = LOC_ALIAS[raw] || LOC_ALIAS[raw.replace(/["'-]/g, "")];
      if (direct && IDX.byCode[direct]) return IDX.byCode[direct];
      var k = keys(raw);
      if (IDX.byKey[k.k]) return IDX.byKey[k.k].L;
      if (IDX.bySk[k.sk]) return IDX.bySk[k.sk].L;
      return null;
    }
    function findLocFuzzy(text) {
      var k = keys(clean(text).replace(LOC_PREFIX, "")), best = null, bd = 99;
      if (k.sk.length < 4) return null;
      var max = k.sk.length >= 7 ? 2 : 1;
      for (var s in IDX.bySk) { var d = dl(k.sk, s, max); if (d <= max && d < bd) { bd = d; best = IDX.bySk[s].L; } }
      return best;
    }
    function shard(c) {
      if (!shardP[c]) {
        shardP[c] = getJSON(c + ".json").then(function (d) {
          d.streets = d.s.map(function (s) {
            return { names: s[0], keys: s[0].map(keys), x: s[1], y: s[2], h: s[3] };
          });
          d.nbs = (d.h || []).map(function (h) { return { name: h[0], key: keys(h[0]), x: h[1], y: h[2], id: h[3] || null }; });
          return d;
        });
        shardP[c]["catch"](function () { delete shardP[c]; });
      }
      return shardP[c];
    }
    function houses(d, st) { // decode the delta-coded house list (lazy-loading the bucket for big cities)
      if (st.H) return Promise.resolve(st.H);
      var hp;
      if (typeof st.h === "number") {
        var bk = d.c + "-" + st.h;
        if (!bucketP[bk]) { bucketP[bk] = getJSON(bk + ".json"); bucketP[bk]["catch"](function () { delete bucketP[bk]; }); }
        hp = bucketP[bk].then(function (b) {
          var i = d.streets.filter(function (s) { return s.h === st.h; }).indexOf(st);
          return b[i] || [];
        });
      } else hp = Promise.resolve(st.h || []);
      return hp.then(function (h) {
        var out = [], n = 0, x = d.o[0], y = d.o[1];
        for (var i = 0; i < h.length; i += 3) {
          var v = h[i], suf = "";
          if (typeof v === "number") n += v; else { n = parseInt(v, 10); suf = String(v).replace(/^\d+/, ""); }
          x += h[i + 1]; y += h[i + 2];
          out.push({ n: n, suf: suf, x: x, y: y });
        }
        st.H = out; return out;
      });
    }
    function matchName(qk, entries) {
      // returns [{e, score, fuzzy}] best first
      var res = [];
      var qset = qk.t.join(" ");
      entries.forEach(function (e) {
        var best = 0, fz = false;
        e.keys.forEach(function (k) {
          var s = 0, f = false;
          if (k.k === qk.k) s = 1;
          else if (k.c === qk.c) s = 0.97;
          else if (k.sk && k.sk === qk.sk) s = 0.95;
          else {
            // token containment (official lists are often "surname firstname", users type one of them)
            var inter = qk.skt.filter(function (t) { return t.length >= 2 && k.skt.indexOf(t) >= 0; });
            if (inter.length && inter.join("").length >= 3) {
              if (inter.length === qk.skt.length) s = 0.9 - 0.04 * (k.skt.length - inter.length);
              else if (inter.length === k.skt.length) s = 0.8 - 0.05 * (qk.skt.length - inter.length);
            }
            if (s < 0.7 && qk.sk.length >= 4) {
              var max = qk.sk.length >= 8 ? 2 : 1, d = dl(qk.sk, k.sk, max);
              if (d <= max) { var fs = 0.75 - 0.1 * d; if (fs > s) { s = fs; f = true; } }
            }
          }
          if (s > best) { best = s; fz = f; }
        });
        if (best > 0) res.push({ e: e, score: best, fuzzy: fz });
      });
      res.sort(function (a, b) {
        return b.score - a.score || ((b.e.x != null) - (a.e.x != null)) || (hlen(b.e) - hlen(a.e));
      });
      return res;
      function hlen(e) { return typeof e.h === "number" ? 1 : (e.h || []).length; }
    }
    function toLL(d, x, y) { return { lat: y / 1e5, lon: x / 1e5 }; }
    function hav(a, b) {
      var R = 6371008.8, r = Math.PI / 180, dy = (b.lat - a.lat) * r, dx = (b.lon - a.lon) * r;
      var h = Math.sin(dy / 2) * Math.sin(dy / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dx / 2) * Math.sin(dx / 2);
      return 2 * R * Math.asin(Math.sqrt(h));
    }
    function pickHouse(H, num, suf) {
      if (!H.length || num == null) return null;
      var i, ex = null, exn = null;
      for (i = 0; i < H.length; i++) if (H[i].n === num) { if (H[i].suf === suf) ex = H[i]; if (!exn || !H[i].suf) exn = exn && !exn.suf ? exn : H[i]; }
      if (ex || exn) return { p: ex || exn, prec: "house" };
      var lo = null, hi = null, alo = null, ahi = null;
      for (i = 0; i < H.length; i++) {
        var h = H[i];
        if (h.n % 2 === num % 2) { if (h.n < num && (!lo || h.n > lo.n)) lo = h; if (h.n > num && (!hi || h.n < hi.n)) hi = h; }
        if (h.n < num && (!alo || h.n > alo.n)) alo = h; if (h.n > num && (!ahi || h.n < ahi.n)) ahi = h;
      }
      if (lo && hi && hi.n - lo.n <= 40) {
        var t = (num - lo.n) / (hi.n - lo.n), p = { x: lo.x + t * (hi.x - lo.x), y: lo.y + t * (hi.y - lo.y) };
        if (hav({ lat: lo.y / 1e5, lon: lo.x / 1e5 }, { lat: hi.y / 1e5, lon: hi.x / 1e5 }) < 1200) return { p: p, prec: "interp" };
      }
      var near = [lo, hi, alo, ahi].filter(Boolean).sort(function (a, b) { return Math.abs(a.n - num) - Math.abs(b.n - num); })[0];
      if (near && Math.abs(near.n - num) <= 6) return { p: near, prec: "interp" };
      return null;
    }

    // Parse "street number, city" (comma optional, city first or last, number first or last).
    function parse(q) {
      var s = clean(q).replace(/,?\s*(ישראל|israel)\s*$/i, "");
      s = s.replace(/(^|[\s,])(רח'|רח\.|רחוב)\s*/g, "$1").replace(/(^|[\s,])(שד'|שד\.)\s*/g, "$1שדרות ");
      var parts = s.split(/\s*,\s*/).filter(Boolean), loc = null, rest = s, i, k, w;
      if (parts.length > 1) {
        for (i = parts.length - 1; i >= 0 && !loc; i--) if ((loc = findLoc(parts[i]))) parts.splice(i, 1);
        if (loc) rest = parts.join(" ");
      }
      if (!loc) {
        w = s.replace(/,/g, " ").split(/\s+/).filter(Boolean);
        for (k = Math.min(5, w.length); k >= 1 && !loc; k--) {
          if ((loc = findLoc(w.slice(w.length - k).join(" ")))) rest = w.slice(0, w.length - k).join(" ");
          else if (k < w.length && (loc = findLoc(w.slice(0, k).join(" ")))) rest = w.slice(k).join(" ");
        }
      }
      if (!loc && parts.length > 1) { loc = findLocFuzzy(parts[parts.length - 1]); if (loc) rest = parts.slice(0, -1).join(" "); }
      var pn = parseNumber(rest);
      return { loc: loc, street: pn.street.replace(/^[\s,]+|[\s,]+$/g, ""), num: pn.num, suf: pn.suf };
    }

    function search(q, o) {
      o = o || {};
      return index().then(function () {
        var p = parse(q);
        if (!p.loc && o.defaultLocality) p.loc = IDX.byCode[o.defaultLocality] || null;
        if (!p.loc) return null;
        var L = p.loc, base = { c: L.c, cname: L.n, src: "local", num: p.num, street: null, parsed: p };
        function settle(extra) {
          var r = { lat: L.lat, lon: L.lon, prec: "settlement", label: L.n, needRemote: !!p.street };
          for (var k in base) if (r[k] === undefined) r[k] = base[k];
          for (k in extra || {}) r[k] = extra[k];
          return r;
        }
        if (!p.street || !L.has) return settle();
        return shard(L.c).then(function (d) {
          var qk = keys(p.street);
          if (!qk.k) return settle();
          // a bare name without a number: neighborhoods first
          if (p.num == null) {
            var nm = matchName(qk, d.nbs.map(function (n) { return { keys: [n.key], n: n, x: n.x, y: n.y }; }));
            if (nm.length && nm[0].score >= 0.9) {
              var nb = nm[0].e.n, ll = toLL(d, d.o[0] + nb.x, d.o[1] + nb.y);
              return mk(ll, "neighborhood", nb.name + ", " + L.n, { score: nm[0].score, nb: nb.id });
            }
          }
          var m = matchName(qk, d.streets);
          if (!m.length || m[0].score < 0.6) {
            var nm2 = matchName(qk, d.nbs.map(function (n) { return { keys: [n.key], n: n, x: n.x, y: n.y }; }));
            if (nm2.length && nm2[0].score >= 0.85) {
              var nb2 = nm2[0].e.n;
              return mk(toLL(d, d.o[0] + nb2.x, d.o[1] + nb2.y), "neighborhood", nb2.name + ", " + L.n, { score: nm2[0].score, nb: nb2.id, needRemote: true });
            }
            return settle({ needRemote: true });
          }
          // among equally good street candidates, prefer the one that actually has the house number
          var top = m.filter(function (x) { return x.score === m[0].score; }).slice(0, 4);
          return Promise.all(top.map(function (x) { return houses(d, x.e); })).then(function (Hs) {
            var best = null;
            top.forEach(function (x, i) {
              var h = pickHouse(Hs[i], p.num, p.suf);
              var rank = h ? (h.prec === "house" ? 3 : 2) : (x.e.x != null ? 1 : 0);
              if (!best || rank > best.rank) best = { x: x, h: h, rank: rank };
            });
            var st = best.x.e, name = st.names[0], extra = { score: best.x.score, fuzzy: best.x.fuzzy, street: name, alts: m.slice(1, 4).map(function (a) { return a.e.names[0]; }) };
            if (best.h) return mk(toLL(d, best.h.p.x, best.h.p.y), best.h.prec, name + " " + p.num + (p.suf || "") + ", " + L.n, extra);
            if (st.x != null) {
              extra.needRemote = p.num != null;
              return mk(toLL(d, d.o[0] + st.x, d.o[1] + st.y), "street", name + ", " + L.n, extra);
            }
            extra.needRemote = true; extra.street = name;
            return settle(extra);
          });
          function mk(ll, prec, label, extra) {
            var r = { lat: Math.round(ll.lat * 1e6) / 1e6, lon: Math.round(ll.lon * 1e6) / 1e6, prec: prec, label: label };
            for (var k in base) r[k] = base[k];
            for (k in extra) r[k] = extra[k];
            return r;
          }
        });
      });
    }
    return { search: search, parse: function (q) { return index().then(function () { return parse(q); }); },
      index: index, shard: shard, locality: function (c) { return index().then(function () { return IDX.byCode[c] || null; }); } };
  }

  // ---------------- remote fallback queue ----------------
  // Per-host serial queue: min interval + random jitter, in-flight dedupe, memory + sessionStorage cache,
  // exponential backoff with a circuit breaker on 429/5xx/network errors. Signature matches app.js throttled().
  function remoteQueue(cfg) {
    cfg = cfg || {};
    var MIN = cfg.minIntervalMs || { nom: 1100, photon: 1000, govmap: 700, cec: 300, datagov: 300 };
    var JIT = cfg.jitterMs || 400, store = null, mem = {}, hosts = {};
    try { store = root.sessionStorage; } catch (e) { store = null; }
    function host(h) {
      return hosts[h] || (hosts[h] = { next: 0, fails: 0, openUntil: 0, chain: Promise.resolve() });
    }
    return function throttled(h, url, opts) {
      var key = url + (opts && opts.body || ""), sk = "kg:" + key;
      if (mem[key]) return mem[key];
      if (store) { try { var hit = store.getItem(sk); if (hit) return (mem[key] = Promise.resolve(JSON.parse(hit))); } catch (e) {} }
      var H = host(h);
      if (Date.now() < H.openUntil) return Promise.reject(new Error(h + " circuit open"));
      var p = H.chain.then(function () {
        var gap = (typeof MIN === "number" ? MIN : (MIN[h] || 1000)) + Math.random() * JIT;
        var wait = Math.max(0, H.next - Date.now());
        H.next = Date.now() + wait + gap;
        return new Promise(function (ok) { setTimeout(ok, wait); });
      }).then(function () {
        if (Date.now() < H.openUntil) throw new Error(h + " circuit open");
        return fetch(url, opts).then(function (r) {
          if (r.status === 429 || r.status >= 500) throw Object.assign(new Error(h + " " + r.status), { retryable: true });
          if (!r.ok) throw new Error(h + " " + r.status);
          return r.json();
        });
      }).then(function (j) {
        H.fails = 0;
        if (store) { try { store.setItem(sk, JSON.stringify(j)); } catch (e) {} }
        return j;
      }, function (e) {
        H.fails++;
        var back = Math.min(60000, 1000 * Math.pow(2, H.fails)) * (0.5 + Math.random());
        H.next = Math.max(H.next, Date.now() + back);
        if (H.fails >= 3) H.openUntil = Date.now() + back;
        delete mem[key];
        throw e;
      });
      H.chain = p["catch"](function () {});
      return (mem[key] = p);
    };
  }

  var API = { create: create, remoteQueue: remoteQueue, _keys: keys, _parseNumber: parseNumber, _clean: clean };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.KalpiGeo = API;
})(typeof self !== "undefined" ? self : this);
