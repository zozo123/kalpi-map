"use strict";
(function () {
  var NEAREST = 5, MIN_SHARE = 0.01;
  var COLORS = {};
  var OTHER = "#8c939b";
  var D = null, P = [], marker = null, layerNear = null, allLayer = null;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var fmt = function (n) { return n.toLocaleString("he-IL"); };
  var pct = function (x) { return (x * 100).toFixed(1) + "%"; };

  function status(t) { $("status").textContent = t; }

  // ---------- map ----------
  var map = L.map("map", { zoomControl: true }).setView([31.7, 34.95], 8);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  var renderer = L.canvas({ padding: 0.5 });
  map.on("click", function (e) { locate(e.latlng.lat, e.latlng.lng, "נקודה שנבחרה במפה", "manual"); });

  // ---------- data ----------
  status("טוען נתונים…");
  fetch("data/kalpiot26.json").then(function (r) { return r.json(); }).then(function (d) {
    D = d; P = d.parties;
    P.forEach(function (p) { COLORS[p[0]] = p[4]; });
    d.b.forEach(function (b) { b.agg = aggregate(b.k); });
    allLayer = L.layerGroup(d.b.map(function (b) {
      var top = b.agg.parties[0];
      return L.circleMarker([b.y, b.x], { renderer: renderer, radius: 4, weight: 1, color: "#fff",
        fillColor: top ? color(top.code) : OTHER, fillOpacity: .85 })
        .bindPopup(function () { return popupHtml(b); })
        .on("click", function (e) { L.DomEvent.stopPropagation(e); });
    }));
    map.on("zoomend", toggleAll); toggleAll();
    var asOf = d.source_as_of ? new Date(d.source_as_of).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" }) : "?";
    var nk = d.b.reduce(function (s, b) { return s + b.k.length; }, 0);
    var ver = "תוצאות סופיות, נתונים נכונים ל-31 באוקטובר 2026 (תמונת מצב " + asOf + " שעון ישראל). מקור: ועדת הבחירות המרכזית דרך harelc/elections-vote-transfer. " +
      fmt(nk) + " קלפיות ב-" + fmt(d.b.length) + " מקומות.";
    $("ver").textContent = ver; $("dataver").textContent = ver;
    status("");
    var q = new URLSearchParams(location.search).get("q");
    if (q) { $("q").value = q; search(); }
  }).catch(function () { status("טעינת הנתונים נכשלה. נסו לרענן את הדף."); });

  function toggleAll() { if (!allLayer) return; if (map.getZoom() >= 12) allLayer.addTo(map); else allLayer.remove(); }
  function color(code) { return COLORS[code] || OTHER; }

  // kalpi row: [barzel, kalpiNo, eligible, voters, invalid, accessible, [partyIdx, votes, ...]]
  function aggregate(ks) {
    var el = 0, vo = 0, inv = 0, votes = {};
    ks.forEach(function (k) {
      el += k[2]; vo += k[3]; inv += k[4];
      for (var i = 0; i < k[6].length; i += 2) votes[k[6][i]] = (votes[k[6][i]] || 0) + k[6][i + 1];
    });
    var valid = 0; Object.keys(votes).forEach(function (i) { valid += votes[i]; });
    var parties = Object.keys(votes).map(function (i) { return { code: P[i][0], name: P[i][1], full: P[i][2], v: votes[i] }; })
      .sort(function (a, b) { return b.v - a.v; });
    return { eligible: el, voters: vo, invalid: inv, valid: valid, parties: parties };
  }

  function barsHtml(a) {
    if (!a.valid) return '<div class="meta">אין קולות כשרים בקלפי זו.</div>';
    var shown = a.parties.filter(function (p) { return p.v / a.valid >= MIN_SHARE; });
    var rest = a.valid - shown.reduce(function (s, p) { return s + p.v; }, 0);
    var max = shown.length ? shown[0].v / a.valid : 0;
    var rows = shown.map(function (p) { return bar(p.name + " (" + p.code + ")", p.full, p.v, a.valid, max, color(p.code)); });
    if (rest > 0) rows.push(bar("אחרות (מתחת ל-1%)", "", rest, a.valid, Math.max(max, rest / a.valid), OTHER));
    return '<div class="bars">' + rows.join("") + "</div>";
  }
  function bar(label, title, v, tot, max, col) {
    var s = v / tot;
    return '<div class="bar" title="' + esc((title || label) + ": " + fmt(v) + " קולות") + '"><span class="lbl">' + esc(label) +
      '</span><span class="trk"><span class="fill" style="display:block;width:' + (max ? (s / max * 100) : 0).toFixed(1) +
      "%;background:" + col + '"></span></span><span class="pct">' + pct(s) + "</span></div>";
  }
  function statsHtml(a) {
    return '<div class="stats"><span>בעלי זכות בחירה: ' + fmt(a.eligible) + "</span><span>הצביעו: " + fmt(a.voters) +
      " (" + (a.eligible ? pct(a.voters / a.eligible) : "–") + ")</span><span>קולות כשרים: " + fmt(a.valid) +
      "</span><span>פסולים: " + fmt(a.invalid) + "</span></div>";
  }
  function popupHtml(b) {
    var a = b.agg, top = a.parties.slice(0, 3).map(function (p) { return esc(p.name) + " " + pct(p.v / a.valid); }).join(" · ");
    return '<div dir="rtl"><b>' + esc(b.v) + "</b><br>" + esc(b.a) + ", " + esc(b.t) + "<br>" + b.k.length + " קלפיות · הצבעה " +
      (a.eligible ? pct(a.voters / a.eligible) : "–") + "<br>" + top + "</div>";
  }

  // ---------- geometry ----------
  function dist(lat1, lon1, lat2, lon2) {
    var R = 6371000, r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function fmtDist(m) { return m < 1000 ? Math.round(m / 10) * 10 + " מ'" : (m / 1000).toFixed(m < 10000 ? 1 : 0) + ' ק"מ'; }

  function locate(lat, lon, label, prec) {
    if (!D) return;
    var near = D.b.map(function (b) { return { b: b, d: dist(lat, lon, b.y, b.x) }; })
      .sort(function (a, b) { return a.d - b.d; }).slice(0, NEAREST);
    if (marker) marker.remove();
    marker = L.marker([lat, lon], { title: label, draggable: true }).addTo(map).bindTooltip(label);
    marker.on("dragend", function () { var ll = marker.getLatLng(); status("נקודה שנבחרה במפה."); locate(ll.lat, ll.lng, "נקודה שנבחרה במפה", "manual"); });
    if (layerNear) layerNear.remove();
    layerNear = L.layerGroup(near.map(function (n, i) {
      return L.marker([n.b.y, n.b.x], { icon: L.divIcon({ className: "", html: '<span class="card-num" style="display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;border-radius:50%;background:#1f5fbf;color:#fff;font-weight:700;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)">' + (i + 1) + "</span>", iconSize: [24, 24], iconAnchor: [12, 12] }) })
        .bindPopup(popupHtml(n.b));
    })).addTo(map);
    map.fitBounds(L.latLngBounds([[lat, lon]].concat(near.map(function (n) { return [n.b.y, n.b.x]; }))).pad(0.2));
    render(near, label);
    // Exposed for automated tests (no network side effects)
    window.kalpiLast = { lat: lat, lon: lon, prec: prec || "manual", barzel: [].concat.apply([], near.map(function (n) { return n.b.k.map(function (k) { return k[0]; }); })) };
  }

  function render(near, label) {
    var h = '<div class="meta" style="margin-bottom:8px">5 מקומות הקלפי הקרובים אל: ' + esc(label) + "</div>";
    near.forEach(function (n, i) {
      var b = n.b, a = b.agg;
      h += '<article class="card"><h3><span class="num">' + (i + 1) + "</span>" + esc(b.v) + "</h3>" +
        '<div class="meta">' + esc(b.a) + ", " + esc(b.t) + " · " + fmtDist(n.d) + " · " +
        (b.k.length === 1 ? "קלפי " + esc(b.k[0][1]) : b.k.length + " קלפיות (" + b.k.map(function (k) { return esc(k[1]); }).join(", ") + ")") + "</div>" +
        statsHtml(a) + (b.k.length > 1 ? '<div class="meta">סך הכול במקום:</div>' : "") + barsHtml(a);
      if (b.k.length > 1) {
        h += "<details><summary>תוצאות לכל קלפי בנפרד</summary>" + b.k.map(function (k) {
          var ka = aggregate([k]);
          return '<div class="kalpi"><div class="kh">קלפי ' + esc(k[1]) + (k[5] ? " · נגישה" : "") + "</div>" + statsHtml(ka) + barsHtml(ka) + "</div>";
        }).join("") + "</details>";
      }
      h += "</article>";
    });
    $("results").innerHTML = h;
  }

  // ---------- search ----------
  // Geocoder chain (see README): normalize -> Nominatim free text -> Nominatim structured (bounded to the city)
  // -> without "שדרות" -> Photon -> GovMap autocomplete (exact street+number only) -> settlement from the data -> local match.
  // One request per search step, at most 1 request/second per service, results cached, no search-as-you-type, no custom headers.
  var searchId = 0, last = {}, cache = {};
  function throttled(host, url, opts) {
    var key = url + (opts && opts.body || "");
    if (cache[key]) return cache[key];
    var wait = Math.max(0, 1100 - (Date.now() - (last[host] || 0)));
    last[host] = Date.now() + wait;
    cache[key] = new Promise(function (ok) { setTimeout(ok, wait); }).then(function () {
      return fetch(url, opts).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
    });
    cache[key].catch(function () { delete cache[key]; });
    return cache[key];
  }

  var HEB = { "א": 1, "ב": 2, "ג": 3, "ד": 4, "ה": 5, "ו": 6, "ז": 7, "ח": 8, "ט": 9, "י": 10, "כ": 20, "ך": 20, "ל": 30, "מ": 40, "ם": 40, "נ": 50, "ן": 50, "ס": 60, "ע": 70, "פ": 80, "ף": 80, "צ": 90, "ץ": 90, "ק": 100, "ר": 200, "ש": 300, "ת": 400 };
  function hebNum(t) {
    t = t.replace(/["']/g, "");
    if (!t || t.length > 3) return null;
    var n = 0; for (var i = 0; i < t.length; i++) { if (!HEB[t[i]]) return null; n += HEB[t[i]]; }
    return n;
  }
  var ALIASES = { "נצרת עילית": "נוף הגליל", "פתח תקוה": "פתח תקווה", "מודיעין מכבים רעות": "מודיעין-מכבים-רעות", "מודיעין": "מודיעין-מכבים-רעות", "בנימינה": "בנימינה-גבעת עדה", "ת\"א": "תל אביב-יפו", "תא": "תל אביב-יפו", "תל אביב": "תל אביב-יפו", "יפו": "תל אביב-יפו", "תל-אביב": "תל אביב-יפו" };

  function normalize(q) {
    var s = q.replace(/״/g, '"').replace(/[׳`’]/g, "'").replace(/[–־]/g, "-").replace(/\s+/g, " ").trim();
    s = s.replace(/(^|,\s*)(רחוב|רח'|רח\.|רח)\s+/g, "$1");
    s = s.replace(/(^|[\s,])(שד'|שד\.)\s*/g, "$1שדרות ");
    s = s.replace(/^(מושב|קיבוץ|קבוץ)\s+(?=\S)/, "");
    s = s.replace(/(\d+)\s*\/\s*\d+/g, "$1").replace(/\s*(דירה|כניסה)\s*\S+/g, "");
    s = s.replace(/(\s)([א-ת]{1,2}'|[א-ת]{1,2}"[א-ת])(?=\s*,)/g, function (m, sp, tok) { var n = hebNum(tok); return n ? sp + n : m; });
    return s.replace(/\s*,\s*/g, ", ").replace(/\s+/g, " ").replace(/^[\s,]+|[\s,]+$/g, "");
  }
  function plain(s) { return s.replace(/["'״׳`\-–־,.()]/g, " ").replace(/\s+/g, " ").trim(); }
  function skel(s) { return plain(s).replace(/[ךםןףץ]/g, function (c) { return { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" }[c]; }).replace(/[\sאוי]/g, ""); }
  var LOC = null; // locality name -> {exact, skel, n, y, x, bbox}
  function localities() {
    if (LOC) return LOC;
    LOC = {};
    D.b.forEach(function (b) {
      var L0 = LOC[b.t] || (LOC[b.t] = { name: b.t, n: 0, y: 0, x: 0, s: 90, w: 180, nn: -90, e: -180, k: 0 });
      L0.n++; L0.k += b.k.length; L0.y += b.y; L0.x += b.x;
      L0.s = Math.min(L0.s, b.y); L0.nn = Math.max(L0.nn, b.y); L0.w = Math.min(L0.w, b.x); L0.e = Math.max(L0.e, b.x);
    });
    Object.keys(LOC).forEach(function (k) { var o = LOC[k]; o.y /= o.n; o.x /= o.n; });
    return LOC;
  }
  // Find a locality in the data for a typed city name (exact after punctuation, then a vowel-less skeleton).
  function findLoc(city) {
    if (!city) return null;
    var c = ALIASES[city.trim()] || ALIASES[plain(city)] || city, L = localities(), names = Object.keys(L);
    var pc = plain(c), sc = skel(c), i;
    for (i = 0; i < names.length; i++) if (plain(names[i]) === pc || plain(names[i].split(/\s+-\s+/)[0]) === pc) return L[names[i]];
    for (i = 0; i < names.length; i++) if (skel(names[i]) === sc) return L[names[i]];
    return null;
  }
  // Split "<street> <num>, <city>" (comma optional).
  function parse(n) {
    var street = n, city = "", loc = null, m;
    var parts = n.split(/\s*,\s*/);
    if (parts.length > 1) { city = parts.pop(); street = parts.join(" "); loc = findLoc(city); }
    else {
      var w = n.split(" ");
      for (var k = Math.min(4, w.length); k >= 1 && !loc; k--) {
        var cand = w.slice(w.length - k).join(" "), l = findLoc(cand);
        if (l) { loc = l; city = cand; street = w.slice(0, w.length - k).join(" "); }
      }
    }
    if (ALIASES[city]) city = ALIASES[city];
    var num = null;
    if ((m = street.match(/(^|\s)(\d+)[א-ת]?(?=\s|$)/))) { num = m[2]; street = (street.slice(0, m.index) + " " + street.slice(m.index + m[0].length)).replace(/\s+/g, " ").trim(); }
    return { street: street, num: num, city: city, loc: loc };
  }
  function cityOk(names, p) {
    if (!p.city) return true;
    var want = [skel(p.city)]; if (p.loc) want.push(skel(p.loc.name), skel(p.loc.name.split(/\s+-\s+/)[0]));
    return names.some(function (nm) {
      if (!nm) return false; var s = skel(nm);
      return want.some(function (w) { return w.length >= 2 && (s === w || (s.length >= 3 && w.indexOf(s) >= 0) || (w.length >= 3 && s.indexOf(w) >= 0)); });
    });
  }
  // Street names: also fold common transliteration variants (צלאח/סלאח, ת/ט, ק/כ).
  function sskel(s) { return skel(s).replace(/[צש]/g, "ס").replace(/ט/g, "ת").replace(/כ/g, "ק"); }
  function box(l) { var p = 0.03; return [l.w - p, l.nn + p, l.e + p, l.s - p].join(","); }

  function nomUrl(params) {
    return "https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&countrycodes=il,ps&accept-language=he&" + params;
  }
  function nom(params, p, how) {
    return throttled("nom", nomUrl(params)).then(function (res) {
      for (var i = 0; i < res.length; i++) {
        var r = res[i], a = r.address || {};
        if (!cityOk([a.city, a.town, a.village, a.hamlet, a.municipality, a.suburb, a.city_district, a.isolated_dwelling], p)) continue;
        var prec = a.house_number ? "house" : (r.category === "highway" || r.addresstype === "road") ? "street" : "area";
        return { lat: +r.lat, lon: +r.lon, label: r.display_name.split(",").slice(0, 4).join(",").trim(), prec: prec, src: "OpenStreetMap (" + how + ")" };
      }
      return null;
    });
  }
  function photon(q, p) {
    var u = "https://photon.komoot.io/api/?limit=5&bbox=34.2,29.4,35.95,33.4&q=" + encodeURIComponent(q) + (p.loc ? "&lat=" + p.loc.y.toFixed(4) + "&lon=" + p.loc.x.toFixed(4) : "");
    return throttled("photon", u).then(function (res) {
      var f = (res.features || []);
      for (var i = 0; i < f.length; i++) {
        var pr = f[i].properties || {};
        if (!cityOk([pr.city, pr.district, pr.locality, pr.type === "city" || pr.type === "locality" ? pr.name : null], p)) continue;
        if (p.street && pr.street && skel(pr.street).indexOf(skel(p.street.replace(/^שדרות\s+/, ""))) < 0 && skel(p.street).indexOf(skel(pr.street)) < 0) continue;
        var prec = pr.housenumber ? "house" : pr.type === "street" ? "street" : "area";
        var c = f[i].geometry.coordinates;
        return { lat: c[1], lon: c[0], label: [pr.name, pr.street && (pr.street + " " + (pr.housenumber || "")), pr.city].filter(Boolean).join(", "), prec: prec, src: "Photon" };
      }
      return null;
    });
  }
  function govmap(p) {
    var q = p.street + " " + p.num + " " + p.city;
    return throttled("govmap", "https://www.govmap.gov.il/api/search-service/autocomplete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ searchText: q }) }).then(function (res) {
      var rs = (res && res.results) || [];
      var st = sskel(p.street.replace(/^שדרות\s+/, ""));
      for (var i = 0; i < rs.length && i < 5; i++) {
        var r = rs[i], t = r.text || "", m = /POINT\(([\d.\-]+) ([\d.\-]+)\)/.exec(r.shape || "");
        if (r.type !== "address" || !m) continue;
        var tm = t.match(/^(.*?)\s(\d+)\s(.*)$/);
        if (!tm || tm[2] !== String(p.num) || sskel(tm[1]) !== st || !cityOk([tm[3]], p)) continue; // the street, number and city must all match
        var x = +m[1], y = +m[2];
        return { lat: (2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) * 180 / Math.PI, lon: x / 6378137 * 180 / Math.PI, label: t, prec: "house", src: "GovMap" };
      }
      return null;
    });
  }

  var PREC = { house: "כתובת מדויקת", street: "רחוב בלבד (מספר הבית לא נמצא)", area: "שכונה/אזור", settlement: "מרכז היישוב", local: "לפי כתובת קלפי תואמת" };
  function search() {
    var q = $("q").value.trim();
    $("alts").innerHTML = "";
    if (!q || !D) return;
    history.replaceState(null, "", "?q=" + encodeURIComponent(q));
    var id = ++searchId, n = normalize(q), p = parse(n);
    var free = p.loc && p.city ? (p.street + (p.num ? " " + p.num : "") + ", " + p.city).replace(/^,\s*/, "") : n;
    status("מחפש את הכתובת…");
    // A bare settlement name: use that settlement's polling places from the data.
    if (!p.street && p.loc) return settlement(p.loc, "");
    var steps = [function () { return nom("q=" + encodeURIComponent(free), p, "חיפוש חופשי"); }];
    if (p.city) steps.push(function () {
      return nom("street=" + encodeURIComponent((p.num ? p.num + " " : "") + p.street) + "&city=" + encodeURIComponent(p.city) + (p.loc ? "&viewbox=" + box(p.loc) + "&bounded=1" : ""), p, "חיפוש מובנה");
    });
    if (/^שדרות\s/.test(p.street)) {
      var s2 = p.street.replace(/^שדרות\s+/, "");
      steps.push(function () { return nom("q=" + encodeURIComponent(s2 + (p.num ? " " + p.num : "") + (p.city ? ", " + p.city : "")) + (p.loc ? "&viewbox=" + box(p.loc) + "&bounded=1" : ""), p, "בלי 'שדרות'"); });
    }
    steps.push(function () { return photon(free, p); });
    if (p.num && p.street && p.city) steps.push(function () { return govmap(p); });
    var best = null, failed = 0, i = 0;
    (function next() {
      if (id !== searchId) return;
      if (i >= steps.length) {
        if (best) return show(best);
        if (p.loc) return settlement(p.loc, failed === steps.length ? "שירותי איתור הכתובות לא זמינים כרגע. " : "הכתובת לא נמצאה. ");
        return localSearch(q, failed === steps.length ? "שירותי איתור הכתובות לא זמינים כרגע. " : "הכתובת לא נמצאה. ");
      }
      steps[i++]().then(function (r) {
        if (id !== searchId) return;
        if (r && (r.prec === "house" || !p.num)) return show(r);
        if (r && !best) best = r;
        next();
      }, function () { failed++; next(); });
    })();
    function show(r) {
      if (id !== searchId) return;
      status("נמצא: " + r.label + " · דיוק: " + PREC[r.prec] + " · מקור: " + r.src + ". אפשר לגרור את הסמן כדי לדייק.");
      locate(r.lat, r.lon, r.label, r.prec);
    }
  }
  function settlement(l, why) {
    status(why + "מוצג מרכז היישוב " + l.name + " (" + l.k + " קלפיות ב-" + l.n + " מקומות). דיוק: " + PREC.settlement + ". לחצו על המפה או גררו את הסמן כדי לדייק.");
    locate(l.y, l.x, "מרכז " + l.name, "settlement");
  }

  // Last resort: match the query against the polling-place addresses (locality first, then street)
  function norm(s) { return " " + s.replace(/["'״׳`\-–,.()]/g, " ").replace(/\s+/g, " ").trim() + " "; }
  function localSearch(q, why) {
    var nq = norm(normalize(q)).replace(/ קריית /g, " קרית ");
    var locs = {};
    D.b.forEach(function (b) {
      var forms = [norm(b.t), norm(b.t.split(/\s*-\s*/)[0])];
      forms.forEach(function (t) { if (t.length > 3 && nq.indexOf(t) >= 0 && (locs[b.t] || 0) < t.length) locs[b.t] = t.length; });
    });
    var locNames = Object.keys(locs).sort(function (a, b) { return locs[b] - locs[a]; });
    var loc = locNames[0];
    var rest = nq;
    if (loc) rest = nq.replace(norm(loc), " ").replace(norm(loc.split(/\s*-\s*/)[0]), " ");
    var toks = rest.split(" ").filter(function (t) { return t.length > 1 && !/^\d+$/.test(t) && !/^(רחוב|רח|שדרות|שד|דרך)$/.test(t); });
    var pool = loc ? D.b.filter(function (b) { return b.t === loc; }) : D.b;
    var best = [], bestScore = 0;
    pool.forEach(function (b) {
      var hay = norm(b.a + " " + b.v), s = 0;
      toks.forEach(function (t) { if (hay.indexOf(" " + t + " ") >= 0) s += 2; else if (hay.indexOf(t) >= 0) s += 1; });
      if (s > bestScore) { bestScore = s; best = [b]; } else if (s === bestScore && s > 0) best.push(b);
    });
    if (bestScore >= 2) {
      var qn = (q.match(/\d+/) || [])[0];
      if (qn) best.sort(function (a, b) {
        var an = +((a.a.match(/\d+/) || [1e9])[0]), bn = +((b.a.match(/\d+/) || [1e9])[0]);
        return Math.abs(an - qn) - Math.abs(bn - qn);
      });
      var b = best[0];
      status(why + "מוצג לפי כתובת קלפי תואמת: " + b.a + ", " + b.t + ". דיוק: " + PREC.local + ". גררו את הסמן כדי לדייק.");
      return locate(b.y, b.x, b.a + ", " + b.t, "local");
    }
    if (loc) return settlement(localities()[loc], why);
    status(why + "לא נמצאה התאמה. נסו לכתוב רחוב, מספר ועיר, או לחצו על המפה.");
  }

  $("go").onclick = search;
  $("q").addEventListener("keydown", function (e) { if (e.key === "Enter") search(); });
  $("loc").onclick = function () {
    if (!navigator.geolocation) return status("הדפדפן לא תומך באיתור מיקום.");
    status("מאתר את המיקום שלכם…");
    navigator.geolocation.getCurrentPosition(function (p) { status(""); locate(p.coords.latitude, p.coords.longitude, "המיקום שלי"); },
      function () { status("לא ניתן לקבל את המיקום."); }, { enableHighAccuracy: true, timeout: 10000 });
  };
})();
