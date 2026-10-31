"use strict";
(function () {
  var NEAREST = 5, MIN_SHARE = 0.01;
  var COLORS = {};
  var OTHER = "#b8bcc2", DOT = "#3f3d39"; // OTHER is hatched in CSS; no longer equals the צבע שחור list colour
  var D = null, P = [], marker = null, layerNear = null, allLayer = null, NAT = null, nearMarkers = [];
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var fmt = function (n) { return n.toLocaleString("he-IL"); };
  var pct = function (x) { return (x * 100).toFixed(1) + "%"; };

  function status(t, html) { if (html) $("status").innerHTML = t; else $("status").textContent = t; }

  // ---------- layout helpers: media queries and the mobile bottom sheet ----------
  var mq = window.matchMedia ? window.matchMedia("(max-width: 860px)") : { matches: false, addEventListener: function () {} };
  var reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var sheet = (function () {
    var panel = $("panel"), btn = $("sheetToggle"), scroller = $("panelScroll"), st = { state: "peek" }, drag = null, ORDER = ["peek", "half", "full"];
    function H() { return panel.offsetHeight || window.innerHeight * 0.92; }
    function peekPx() { var f = $("searchForm"); return Math.round(Math.min(window.innerHeight * 0.5, Math.max(190, f.offsetTop + f.offsetHeight + 14 - scroller.scrollTop))); }
    function visible(s) { return s === "full" ? H() : s === "half" ? Math.round(window.innerHeight * 0.56) : peekPx(); }
    function set(s) {
      st.state = s; panel.setAttribute("data-state", s);
      btn.setAttribute("aria-expanded", s !== "peek" ? "true" : "false");
      btn.setAttribute("aria-label", s === "full" ? "כיווץ חלונית התוצאות" : "הרחבת חלונית התוצאות");
      if (!mq.matches) { panel.style.removeProperty("--sheet-y"); return; }
      if (s === "peek") scroller.scrollTop = 0;
      panel.style.setProperty("--sheet-y", Math.max(0, H() - visible(s)) + "px");
    }
    btn.addEventListener("pointerdown", function (e) {
      if (!mq.matches) return;
      drag = { y0: e.clientY, t0: Date.now(), base: H() - visible(st.state), moved: false };
      panel.classList.add("dragging"); try { btn.setPointerCapture(e.pointerId); } catch (x) {}
    });
    btn.addEventListener("pointermove", function (e) {
      if (!drag) return; var dy = e.clientY - drag.y0; if (Math.abs(dy) > 5) drag.moved = true;
      panel.style.setProperty("--sheet-y", Math.max(0, Math.min(H() - 120, drag.base + dy)) + "px");
    });
    function end(e) {
      if (!drag) return; panel.classList.remove("dragging"); var d = drag; drag = null;
      if (!d.moved) return set(st.state);
      var dy = e.clientY - d.y0, v = dy / Math.max(1, Date.now() - d.t0), vis = H() - Math.max(0, d.base + dy), best = st.state, bd = 1e9;
      ORDER.forEach(function (k) { var dd = Math.abs(visible(k) - vis); if (dd < bd) { bd = dd; best = k; } });
      if (Math.abs(v) > 0.6) best = ORDER[Math.max(0, Math.min(2, ORDER.indexOf(st.state) + (v < 0 ? 1 : -1)))];
      st.skipClick = true; set(best);
    }
    btn.addEventListener("pointerup", end); btn.addEventListener("pointercancel", end);
    btn.addEventListener("click", function () {
      if (st.skipClick) { st.skipClick = false; return; }
      set(st.state === "peek" ? "half" : st.state === "half" ? "full" : "peek");
    });
    window.addEventListener("resize", function () { set(st.state); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { set(st.state); });
    st.set = set; st.visible = visible; st.scroller = scroller;
    set("peek");
    return st;
  })();

  // ---------- map ----------
  var ISRAEL = L.latLngBounds([[29.48, 34.25], [33.33, 35.9]]);
  var map = L.map("map", { zoomControl: false, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 90 });
  L.control.zoom({ position: "topleft", zoomInTitle: "התקרבות", zoomOutTitle: "התרחקות" }).addTo(map);
  // Light, desaturated basemap: OSM tiles (Hebrew labels) toned down with a CSS filter (.basemap in style.css).
  // CARTO Positron now needs an API key, so it is not used.
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, className: "basemap", attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  function placeAttribution() { map.attributionControl.setPosition(mq.matches ? "topleft" : "bottomright"); }
  placeAttribution(); mq.addEventListener && mq.addEventListener("change", function () { placeAttribution(); sheet.set(sheet.state); map.invalidateSize(); });
  map.fitBounds(ISRAEL, mapPad(false));
  // Map padding so the fly-to target is not hidden behind the mobile bottom sheet or the layer control.
  function mapPad(forState) {
    var cover = mq.matches ? sheet.visible(forState || sheet.state) : 0;
    return { paddingTopLeft: [30, mq.matches ? 70 : 90], paddingBottomRight: [30, 30 + cover] };
  }
  function flyTo(bounds, maxZoom) {
    var o = mapPad(); o.maxZoom = maxZoom || 16;
    if (reduceMotion) return map.fitBounds(bounds, o);
    o.duration = 1.15; o.easeLinearity = 0.2;
    map.flyToBounds(bounds, o);
  }
  var renderer = L.canvas({ padding: 0.5 });
  // Map click drops a point (desktop); on touch, a long-press does, so panning never triggers a search.
  map.on("click", function (e) { if (!mq.matches) locate(e.latlng.lat, e.latlng.lng, "נקודה במפה", "manual"); });
  map.on("contextmenu", function (e) { locate(e.latlng.lat, e.latlng.lng, "נקודה במפה", "manual"); });

  // ---------- data ----------
  status("טוען נתונים…");
  fetch("data/kalpiot26.json").then(function (r) { return r.json(); }).then(function (d) {
    D = d; P = d.parties;
    setTimeout(function () { try { acLocs(); } catch (e) {} }, 400); // warm the typeahead's locality list off the keystroke path
    setTimeout(layerSelect, 0);
    P.forEach(function (p) { COLORS[p[0]] = p[4]; });
    d.b.forEach(function (b) { b.agg = aggregate(b.k); });
    NAT = aggregate([].concat.apply([], d.b.map(function (b) { return b.k; })));
    NAT.share = {}; NAT.parties.forEach(function (p) { NAT.share[p.code] = p.v / NAT.valid; });
    allLayer = L.layerGroup(d.b.map(function (b) {
      var top = b.agg.parties[0];
      return (b.dot = L.circleMarker([b.y, b.x], { renderer: renderer, radius: 3, weight: 1, color: "#fff",
        fillColor: DOT, fillOpacity: .9 }))
        .bindPopup(function () { return popupHtml(b); })
        .on("click", function (e) { L.DomEvent.stopPropagation(e); });
    }));
    map.on("zoomend", toggleAll); toggleAll();
    var asOf = d.source_as_of ? new Date(d.source_as_of).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" }) : "?";
    var nk = d.b.reduce(function (s, b) { return s + b.k.length; }, 0);
    var dt = d.source_as_of ? new Date(d.source_as_of) : null;
    TS = dt ? "נתוני ועדת הבחירות המרכזית, נכונים ל-" + dt.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" }) + " בשעה " +
      dt.toLocaleTimeString("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" }) + " (שעון ישראל). ייתכנו הבדלים קטנים מהפרסום הרשמי הסופי." : "נתוני ועדת הבחירות המרכזית.";
    var ver = TS + " מקור: ועדת הבחירות המרכזית דרך harelc/elections-vote-transfer. " + fmt(nk) + " קלפיות ב-" + fmt(d.b.length) + " מקומות.";
    $("ver").textContent = ver; $("dataver").textContent = ver; $("ts").textContent = dt ? "נתונים נכונים ל-" + dt.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" }) + " (שעון ישראל)" : "";
    status("");
    var usp = new URLSearchParams(location.search), queued = pending; pending = false;
    applyUrl(usp);
    if (queued && !usp.get("q") && $("q").value.trim()) search(); // a search typed while the data was loading
  }).catch(function () {
    $("status").innerHTML = '<div class="banner danger" role="alert">לא הצלחנו לטעון את נתוני הקלפיות. בדקו את החיבור ונסו שוב. <button type="button" class="linkish" onclick="location.reload()">נסו שוב</button></div>';
  });

  // Building dots: neutral grey from z11 (r3), larger from z14 (r4); party colour only when the "הרשימה הגדולה" layer is on.
  function toggleAll() {
    if (!allLayer) return; var z = map.getZoom();
    if (z >= 11) { allLayer.addTo(map); var r = z >= 14 ? 4 : 3; if (toggleAll.r !== r) { toggleAll.r = r; D.b.forEach(function (b) { b.dot.setRadius(r); }); } } else allLayer.remove();
  }
  function dotColors() {
    if (!D) return; var w = /:winner$/.test(mode);
    D.b.forEach(function (b) { var t = b.agg.parties[0]; b.dot.setStyle({ fillColor: w && t ? color(t.code) : DOT }); });
  }
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

  // ctx.c: CBS/CEC locality code of the geocoded address -> only that locality's polling places are candidates
  // (residents vote in their own locality). ctx.nb: CEC neighborhood id, known when the user searched a neighborhood.
  function locate(lat, lon, label, prec, ctx) {
    if (!D) return;
    ctx = ctx || {};
    if (ctx.nb && !N && !ctx.waited) { ctx.waited = 1; return extras().then(function () { locate(lat, lon, label, prec, ctx); }); }
    var all = D.b.map(function (b) { return { b: b, d: dist(lat, lon, b.y, b.x) }; }).sort(function (a, b) { return a.d - b.d; });
    if (all[0].d > 20000) { status(""); $("status").innerHTML = '<div class="banner warn" role="alert">הנקודה רחוקה מכל קלפי בישראל.</div>'; return; }
    var lc = ctx.c && locByCode(ctx.c);
    where = { prec: prec || "manual", src: ctx.src || "", c: ctx.c || null, cname: lc ? lc.name : null, why: ctx.why || "", kalpi: ctx.kalpi || null };
    if (!ctx.fromUrl) {
      if (ctx.kalpi) setUrl({ kalpi: ctx.c + "-" + ctx.kalpi }, true);
      else if (prec === "manual" || prec === "geo") setUrl({ ll: lat.toFixed(prec === "geo" ? 3 : 4) + "," + lon.toFixed(prec === "geo" ? 3 : 4) }, true);
    }
    openPlace = ctx.kalpi ? 0 : -1;
    var near = all, scope = "all";
    if (ctx.c && D.b.some(function (b) { return b.c === ctx.c; })) {
      var inLoc = all.filter(function (n) { return n.b.c === ctx.c; });
      var nbid = ctx.nb && N ? N.h[ctx.nb] : null;
      if (nbid != null) {
        var inNb = inLoc.filter(function (n) { return nbOf(n.b) === nbid; });
        if (inNb.length) { inLoc = inNb.concat(inLoc.filter(function (n) { return nbOf(n.b) !== nbid; })); scope = "nb"; }
      }
      if (scope !== "nb") scope = "loc";
      near = inLoc.length >= NEAREST ? inLoc : inLoc.concat(all.filter(function (n) { return n.b.c !== ctx.c; }).map(function (n) { n.out = true; return n; }));
    }
    near = near.slice(0, NEAREST);
    lastCtx = { c: ctx.c, nb: ctx.nb && N ? N.h[ctx.nb] : null, scope: scope, kalpi: ctx.kalpi || null };
    if (marker) marker.remove();
    marker = L.marker([lat, lon], { title: label, alt: "הנקודה שחיפשתם: " + label, draggable: true, keyboard: true, zIndexOffset: 1000,
      icon: L.divIcon({ className: "", html: '<span class="home"></span>', iconSize: [22, 22], iconAnchor: [11, 11] }) }).addTo(map).bindTooltip(label);
    marker.on("dragend", function () { var ll = marker.getLatLng(); status(""); locate(ll.lat, ll.lng, "נקודה במפה", "manual", { c: ctx.c }); });
    if (layerNear) layerNear.remove();
    nearMarkers = near.map(function (n, i) {
      return L.marker([n.b.y, n.b.x], { title: (i + 1) + ". " + n.b.v, alt: "מקום קלפי " + (i + 1) + ": " + n.b.v, riseOnHover: true,
        icon: L.divIcon({ className: "", html: '<span class="pin">' + (i + 1) + "</span>", iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -12] }) })
        .bindPopup(popupHtml(n.b)).on("click", function () { openCard(i); })
        .on("mouseover", function () { var li = $("place-" + i); if (li) li.classList.add("hi"); }).on("mouseout", function () { var li = $("place-" + i); if (li) li.classList.remove("hi"); });
    });
    layerNear = L.layerGroup(nearMarkers).addTo(map);
    if (mq.matches && sheet.state === "peek") sheet.set("half");
    flyTo(L.latLngBounds([[lat, lon]].concat(near.map(function (n) { return [n.b.y, n.b.x]; }))).pad(0.15), 16);
    lastNear = near; lastLabel = label;
    scrollOnRender = true;
    render(near, label);
    extras().then(function () { if (lastNear === near) render(near, label); });
    // Exposed for automated tests (no network side effects)
    window.kalpiLast = { lat: lat, lon: lon, prec: prec || "manual", barzel: [].concat.apply([], near.map(function (n) { return n.b.k.map(function (k) { return k[0]; }); })), c: ctx.c || null, scope: scope, src: ctx.src || "", why: ctx.why || "" };
    try { document.dispatchEvent(new CustomEvent("kalpi:located", { detail: window.kalpiLast })); } catch (e) {}
  }

  // ---------- editorial rendering (hierarchy and copy per /workspace/kalpi-shared/ux_brief.md §2, §4) ----------
  // Colours for lists that ran only in 2022/2021 (2026 lists use their own colour by name).
  var PAST_COLORS = { "יש עתיד": "#3a78c9", "המחנה הממלכתי": "#3aa0c8", "כחול לבן": "#3aa0c8", "העבודה": "#d23a3a", "מרצ": "#3d9a4f",
    'חד"ש-תע"ל': "#4c8b3a", 'בל"ד': "#6f8a2a", "הבית היהודי": "#5b6fb5", "ימינה": "#7a5fb0", "תקווה חדשה": "#2f7590", "חופש כלכלי": "#c39a2c", "הכלכלית החדשה": "#c39a2c" };
  function colorByName(n) {
    for (var i = 0; i < P.length; i++) if (pname(P[i][1]) === n) return P[i][4];
    return PAST_COLORS[n] || OTHER;
  }
  function bd(s) { return '<bdi class="n">' + s + "</bdi>"; } // bidi-safe numbers
  function pts(x) { return x > 0.05 ? "▲ +" + x.toFixed(1) + " נק'" : x < -0.05 ? "▼ −" + Math.abs(x).toFixed(1) + " נק'" : "0.0 נק'"; }
  function flat(near) { return [].concat.apply([], near.map(function (n) { return n.b.k; })); }
  function turnout(A) { return A.eligible ? A.voters / A.eligible : 0; }
  var scrollOnRender = false, where = null, TS = "", openPlace = -1;
  var BADGE = {
    house: ["כתובת מדויקת", "ok", "הכתובת נמצאה עד רמת מספר הבית."], street: ["רחוב בלבד", "warn", "מספר הבית לא נמצא; הנקודה היא על הרחוב."],
    interp: ["כתובת משוערת", "ok", "מספר הבית משוער לפי הבתים הסמוכים ברחוב."], estreet: ["מיקום משוער לפי הרחוב", "warn", "הרחוב נמצא; מיקום הבית משוער."],
    area: ["שכונה או אזור", "warn", "הנקודה היא מרכז השכונה או האזור."], settlement: ["מרכז היישוב", "warn", "הכתובת לא נמצאה; מוצגות קלפיות סמוך למרכז היישוב."],
    local: ["לפי כתובת של קלפי", "warn", "נמצאה קלפי שכתובתה דומה למה שהוקלד."], manual: ["נקודה שבחרתם", "neutral", "הנקודה נבחרה במפה."],
    geo: ["המיקום שלי", "neutral", "לפי המיקום שהדפדפן מסר. לא נשמר."], kalpi: ["קלפי", "neutral", "נפתח מקישור לקלפי."]
  };
  function srcName(s) { return !s ? "" : /ועדת/.test(s) ? "ועדת הבחירות" : /OpenStreetMap/.test(s) ? "OpenStreetMap" : s; }

  // Aggregates per CEC neighborhood and per locality, built once from the kalpi data.
  var UNB = null, ULOC = {};
  function nbUnits() {
    if (UNB || !N) return UNB;
    UNB = {};
    D.b.forEach(function (b, bi) { b.k.forEach(function (k) { var u = N.k[k[0]]; if (u == null) return; var o = UNB[u] || (UNB[u] = { ks: [], bs: {} }); o.ks.push(k); o.bs[bi] = 1; }); });
    return UNB;
  }
  function nbAgg(u) { var o = nbUnits() && UNB[u]; if (!o) return null; if (!o.A) { o.A = aggregate(o.ks); o.m = Object.keys(o.bs).length; } return o; }
  function locAgg(c) {
    if (ULOC[c]) return ULOC[c];
    var ks = [], m = 0; D.b.forEach(function (b) { if (b.c === c) { ks = ks.concat(b.k); m++; } });
    return (ULOC[c] = { A: aggregate(ks), n: ks.length, m: m });
  }
  // The neighborhood the answer describes: the one searched for, else the one of the nearest in-locality kalpi.
  function nbScope(near) {
    if (!N || !near.length) return null;
    var u = lastCtx.nb != null && N.n[lastCtx.nb] ? lastCtx.nb : null, how = "searched";
    if (u == null) { how = "nearest"; for (var i = 0; i < near.length && u == null; i++) if (!near[i].out && near[i].d <= 1500) u = nbOf(near[i].b); } // a far kalpi's neighborhood says little about the address
    var r = u != null && N.n[u]; if (!r) return null;
    var g = nbAgg(u); if (!g || !g.A.valid) return null;
    return { u: +u, r: r, how: how, name: r[2], city: r[1], A: g.A, n: g.ks.length, m: g.m };
  }

  // Horizontal bars: top 6 + hatched "אחרות" (always last), % and votes, optional national tick.
  function partyBars(A, o) {
    o = o || {};
    if (!A.valid) return '<p class="meta">אין קולות כשרים בקלפי זו.</p>';
    var top = A.parties.slice(0, 6), rest = A.parties.slice(6), rv = rest.reduce(function (s, p) { return s + p.v; }, 0);
    var mx = o.fixed ? 1 : 0;
    if (!o.fixed) { top.forEach(function (p) { mx = Math.max(mx, p.v / A.valid, o.nat && NAT ? NAT.share[p.code] || 0 : 0); }); mx = Math.max(mx, rv / A.valid); }
    mx = mx || 1;
    function row(cls, chip, name, code, title, v, nat) {
      var s = v / A.valid;
      return '<li class="pb' + cls + '" title="' + esc(title + ": " + pct(s) + " מהקולות הכשרים, " + fmt(v) + " קולות") + '"><span class="pb-name">' + chip + '<span class="nm">' + esc(name) + "</span>" +
        (code ? '<span class="pb-code">' + esc(code) + "</span>" : "") + '</span><span class="pb-pct">' + bd(pct(s)) + '</span><span class="pb-votes">' + bd(fmt(v)) + "</span>" +
        '<span class="pb-trk" aria-hidden="true"><span class="pb-fill" style="width:' + (s / mx * 100).toFixed(1) + "%;" + (cls ? "" : "background:" + chip.match(/background:([^"]+)/)[1]) + '"></span>' +
        (nat ? '<span class="pb-nat" style="inset-inline-start:' + (nat / mx * 100).toFixed(1) + '%"></span>' : "") + "</span></li>";
    }
    var rows = top.map(function (p) {
      return row("", '<i class="chip" style="background:' + color(p.code) + '"></i>', pname(p.name), p.code, p.full, p.v, o.nat && NAT ? NAT.share[p.code] : 0);
    });
    if (rv > 0) rows.push(row(" other", '<i class="chip other"></i>', "אחרות", "", rest.length + " רשימות נוספות", rv, 0));
    var others = rv > 0 ? '<details class="others"><summary>מי ב"אחרות"? (' + rest.length + ")</summary><p>" + rest.map(function (p) { return esc(pname(p.name)) + " " + bd(pct(p.v / A.valid)); }).join(" · ") + "</p></details>" : "";
    return '<ul class="pbars' + (o.compact ? " compact" : "") + '">' + rows.join("") + "</ul>" + (o.foot === false ? "" : '<p class="chart-foot">מתוך ' + bd(fmt(A.valid)) + " קולות כשרים" +
      (o.nat ? ' · <span class="k-nat" aria-hidden="true"></span>קו = התוצאה הארצית' : "") + " · מקור: ועדת הבחירות המרכזית</p>") + others;
  }

  function render(near, label) {
    var ks = flat(near), A5 = aggregate(ks), nb = nbScope(near), sc;
    if (where && where.kalpi && near[0]) {
      var kk = near[0].b.k.filter(function (k) { return String(k[1]) === String(where.kalpi); })[0];
      if (kk) sc = { kind: "kalpi", place: where.kalpi, venue: near[0].b.v, A: aggregate([kk]), n: 1, m: 1 };
    }
    if (sc) {} else if (where && where.prec === "settlement" && where.c) { var la = locAgg(where.c); sc = { kind: "loc", place: where.cname || label.replace(/^מרכז /, ""), A: la.A, n: la.n, m: la.m }; }
    else if (nb) sc = { kind: nb.how, place: nb.name, city: nb.city, A: nb.A, n: nb.n, m: nb.m };
    else sc = { kind: "near", A: A5, n: ks.length, m: near.length };
    lastNb = nb ? nb.u : null;
    lastAnswer = answerText(sc);
    var h = whereHtml(label) + answerHtml(sc) +
      '<section class="lvl" aria-labelledby="pl-h"><h2 class="sec" id="pl-h">' + near.length + ' מקומות הקלפי הקרובים</h2><p class="sec-sub">ממוינים לפי מרחק בקו אוויר' +
      (lastCtx.scope === "nb" ? ", קודם בשכונה שחיפשתם" : lastCtx.scope === "loc" ? ", מתוך היישוב בלבד" : "") + ". המספרים תואמים לסיכות במפה.</p>" + placesHtml(near) + "</section>" +
      historyHtml(nb, ks, A5) + contextHtml(near, sc) + disclaimerHtml();
    var R = $("results"); R.innerHTML = h; R.removeAttribute("aria-busy");
    wireResults(R, near);
    $("announce").textContent = "נמצאו " + near.length + " מקומות קלפי. " + lastAnswer;
    if (scrollOnRender) {
      scrollOnRender = false;
      var tgt = R.querySelector(".where") || R;
      if (mq.matches) sheet.scroller.scrollTo({ top: Math.max(0, tgt.offsetTop - 6), behavior: reduceMotion ? "auto" : "smooth" });
      else if (R.getBoundingClientRect().top > window.innerHeight * 0.45) sheet.scroller.scrollTo({ top: tgt.offsetTop - 16, behavior: reduceMotion ? "auto" : "smooth" });
    }
  }
  var lastAnswer = "";

  // Level 0: where we looked.
  function whereHtml(label) {
    var w = where || {}, b = BADGE[w.prec] || BADGE.manual;
    return '<div class="where">' + (w.why ? '<p class="banner warn" role="note">' + esc(w.why) + "</p>" : "") +
      '<p class="where-line"><svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.6" fill="currentColor"/></svg><span class="where-label">' + esc(label) + "</span></p>" +
      '<p class="where-meta"><span class="badge ' + b[1] + '" title="' + esc(b[2]) + '">' + (b[1] === "ok" ? "✓ " : b[1] === "warn" ? "⚠ " : "") + esc(b[0]) + "</span>" +
      (w.src ? '<span class="src">מקור: <bdi>' + esc(srcName(w.src)) + "</bdi></span>" : "") +
      (w.c && w.cname ? '<span class="src">קלפיות מתוך ' + esc(w.cname) + " בלבד</span>" : "") +
      '<button type="button" class="linkish" id="moveLoc" aria-describedby="moveHint">שינוי מיקום</button><span id="moveHint" class="hint" hidden>גררו את הסיכה או לחצו על המפה</span></p></div>';
  }

  // Level 1: the answer card.
  function chipName(p) { return '<b class="ln"><i class="chip" style="background:' + color(p.code) + '"></i>' + esc(pname(p.name)) + "</b>"; }
  function scopeLead(sc) {
    return sc.kind === "kalpi" ? "בקלפי <b>" + esc(sc.place) + "</b> ב" + esc(sc.venue) : sc.kind === "loc" ? "ב<b>" + esc(sc.place) + "</b>" : sc.kind === "searched" ? "בשכונת <b>" + esc(sc.place) + "</b>" :
      sc.kind === "nearest" ? "בשכונת <b>" + esc(sc.place) + "</b>, שבה נמצאת הקלפי הקרובה," : "בקלפיות הקרובות לכתובת";
  }
  function isTie(A) { var t = A.parties; return t.length > 1 && (t[0].v - t[1].v) / A.valid * 100 < 1; }
  function answerText(sc) {
    var A = sc.A; if (!A.valid) return "";
    var t = A.parties, tmp = document.createElement("div");
    tmp.innerHTML = isTie(A) ? scopeLead(sc) + " שתי הרשימות הגדולות קיבלו כמעט אותו אחוז: " + esc(pname(t[0].name)) + " " + pct(t[0].v / A.valid) + " ו" + esc(pname(t[1].name)) + " " + pct(t[1].v / A.valid) + "."
      : scopeLead(sc) + " הרשימה הגדולה הייתה " + esc(pname(t[0].name)) + ", עם " + pct(t[0].v / A.valid) + " מהקולות.";
    return tmp.textContent;
  }
  function answerHtml(sc) {
    var A = sc.A;
    if (!A.valid) return '<article class="answer"><h2 class="answer-h">אין קולות כשרים בקלפיות הקרובות.</h2></article>';
    var t = A.parties, tie = isTie(A), s = function (p) { return bd(pct(p.v / A.valid)); };
    var head = tie ? scopeLead(sc) + " שתי הרשימות הגדולות קיבלו כמעט אותו אחוז: " + chipName(t[0]) + " " + s(t[0]) + " ו" + chipName(t[1]) + " " + s(t[1]) + "."
      : scopeLead(sc) + " הרשימה הגדולה הייתה " + chipName(t[0]) + ", עם <span class=\"big-n\">" + s(t[0]) + "</span> מהקולות.";
    var nx = t.slice(tie ? 2 : 1, tie ? 4 : 3).map(function (p) { return esc(pname(p.name)) + " " + s(p); });
    var second = (nx.length ? "אחריה: " + nx.join(" · ") + " · " : "") + "אחוז הצבעה " + bd(pct(turnout(A)));
    var unit = sc.kind === "kalpi" ? "" : sc.kind === "loc" ? "ביישוב" : sc.kind === "near" ? "הקרובים לכתובת" : "בשכונה · שכונות ועדת הבחירות";
    var nto = NAT ? turnout(NAT) : 0;
    var figs = '<dl class="figs">' +
      "<div><dt>אחוז הצבעה</dt><dd>" + bd(pct(turnout(A))) + "<small>ארצי: " + bd(pct(nto)) + "</small></dd></div>" +
      "<div><dt>בעלי זכות בחירה</dt><dd>" + bd(fmt(A.eligible)) + "</dd></div>" +
      "<div><dt>קולות כשרים</dt><dd>" + bd(fmt(A.valid)) + "<small>פסולים: " + bd(fmt(A.invalid)) + "</small></dd></div>" +
      "<div><dt>קלפיות</dt><dd>" + bd(fmt(sc.n)) + "<small>ב-" + bd(fmt(sc.m)) + " מקומות</small></dd></div></dl>";
    var acts = '<div class="actions"><button type="button" class="act" data-act="copy"><svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>העתקת קישור</button>' +
      (navigator.share ? '<button type="button" class="act" data-act="share"><svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16"><path d="M12 3v13M7 8l5-5 5 5M5 14v5h14v-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>שיתוף</button>' : "") +
      '<button type="button" class="act desk" data-act="cite">העתקת ציטוט</button><button type="button" class="act desk" data-act="print">הדפסה</button></div>';
    return '<article class="answer" aria-labelledby="answer-h"><h2 class="answer-h" id="answer-h">' + head + '</h2><p class="answer-2">' + second + "</p>" +
      partyBars(A, { nat: true }) + '<p class="scope">לפי ' + bd(fmt(sc.n)) + " קלפיות ב-" + bd(fmt(sc.m)) + " מקומות " + unit + "</p>" + figs + acts + "</article>";
  }

  // Level 2: the buildings, numbered like the map pins; collapsed by default.
  function placesHtml(near) {
    return '<ol class="places">' + near.map(function (n, i) {
      var b = n.b, a = b.agg, to = a.eligible ? pct(a.voters / a.eligible) : "–";
      var top2 = a.parties.slice(0, 2).map(function (p) { return esc(pname(p.name)) + " " + bd(pct(p.v / a.valid)); }).join(" · ");
      var badges = (n.out ? '<span class="badge warn">מחוץ ליישוב</span>' : "") + (lastNb != null && nbOf(b) === lastNb ? '<span class="badge neutral">באותה שכונה</span>' : "");
      var small = a.valid && a.valid < 100 ? '<p class="banner warn small">קלפי קטנה: אחוזים עלולים להשתנות מאוד בגלל מעט קולות.</p>' : "";
      var rows = b.k.map(function (k) {
        var ka = aggregate([k]), tp = ka.parties[0];
        return '<tr data-k="' + esc(k[1]) + '"><th scope="row">' + esc(k[1]) + "</th><td>" + bd(fmt(k[2])) + "</td><td>" + bd(k[2] ? pct(k[3] / k[2]) : "–") + "</td><td>" +
          (tp ? '<i class="chip" style="background:' + color(tp.code) + '"></i>' + esc(pname(tp.name)) + " " + bd(pct(tp.v / ka.valid)) : "–") + "</td><td>" + (k[5] ? '<span title="נגישה">♿ נגישה</span>' : "") +
          '</td><td><button type="button" class="klink" data-kalpi="' + b.c + "-" + esc(k[1]) + '" aria-label="העתקת קישור לקלפי ' + esc(k[1]) + '">🔗</button></td></tr>';
      }).join("");
      var perKalpi = b.k.length > 1 ? "<details><summary>תוצאות מלאות לכל קלפי</summary>" + b.k.map(function (k) {
        var ka = aggregate([k]);
        return '<div class="kalpi"><div class="kh">קלפי ' + esc(k[1]) + (k[5] ? " · ♿ נגישה" : "") + "</div>" + statsHtml(ka) + partyBars(ka, { fixed: true, compact: true, foot: false }) + histHtml([k], ka) + "</div>";
      }).join("") + "</details>" : "";
      return '<li class="place" id="place-' + i + '" data-i="' + i + '"><details' + (openPlace === i ? " open" : "") + '><summary><span class="num" aria-hidden="true">' + (i + 1) + '</span><span class="ph"><span class="pv">' + esc(b.v) +
        '</span><span class="pm">' + esc(b.a) + ", " + esc(b.t) + ' · <span class="dist">' + fmtDist(n.d) + "</span> · " + (b.k.length === 1 ? "קלפי " + esc(b.k[0][1]) : b.k.length + " קלפיות") + "</span>" +
        '<span class="pt">' + top2 + " · הצבעה " + bd(to) + "</span>" + (badges ? '<span class="pbadges">' + badges + "</span>" : "") + "</span></summary>" +
        '<div class="pbody">' + statsHtml(a) + small + partyBars(a, { compact: true }) +
        '<table class="kt"><caption class="sr-only">קלפיות במקום</caption><thead><tr><th scope="col">קלפי</th><th scope="col">בעלי זכות</th><th scope="col">הצבעה</th><th scope="col">הרשימה הגדולה</th><th scope="col"><span class="sr-only">נגישות</span></th><th scope="col"><span class="sr-only">קישור</span></th></tr></thead><tbody>' + rows + "</tbody></table>" +
        perKalpi + histHtml(b.k, a) + '<p class="pact"><button type="button" class="tomap" data-i="' + i + '">הצגה במפה</button></p></div></details></li>';
    }).join("") + "</ol>";
  }

  // Level 3: history. Neighborhood series when known, else the same kalpiot via the K25/K24 crosswalk.
  function series(nb, ks, A5) {
    if (!H && !nb) return null;
    var now = {}, s25, s24, q25 = 0, n25, n24, src;
    if (nb) {
      now = nbShares(nb.r, 3); s25 = nbShares(nb.r, 5, N.p25); s24 = nbShares(nb.r, 7, N.p24);
      n25 = N.p25.reduce(function (o, p) { o[pname(p[1])] = 1; return o; }, {}); n24 = N.p24.reduce(function (o, p) { o[pname(p[1])] = 1; return o; }, {});
      src = "nb";
    } else {
      A5.parties.forEach(function (p) { var n = pname(p.name); now[n] = (now[n] || 0) + p.v / (A5.valid || 1); });
      var p25 = past(ks, "25"), p24 = past(ks, "24");
      s25 = p25.sh; s24 = p24.sh; q25 = p25.q; n25 = p25.names || {}; n24 = p24.names || {}; src = "k";
    }
    if (!now) return null;
    var names = Object.keys(now).filter(function (n) {
      return (n25[n] || n24[n]) && Math.max(now[n] || 0, s25 && n25[n] ? s25[n] || 0 : 0, s24 && n24[n] ? s24[n] || 0 : 0) >= 0.02;
    }).sort(function (a, b) { return now[b] - now[a] || (a < b ? -1 : 1); }).slice(0, 8);
    return { now: now, s25: s25, s24: s24, n25: n25, n24: n24, q: q25, src: src, names: names };
  }
  function historyHtml(nb, ks, A5) {
    if (!H) return '<section class="lvl"><h2 class="sec">השוואה ל-2022 ול-2021</h2>' + histWait("p") + '</section>';
    var S5 = series(nb, ks, A5);
    if (!S5 || !S5.s25 && !S5.s24) return '<section class="lvl"><h2 class="sec">השוואה ל-2022 ול-2021</h2><p class="meta"><span class="badge neutral">קלפי או יישוב חדשים</span> אין נתונים מבחירות קודמות למקום הזה.</p></section>';
    var badge = S5.src === "nb" ? '<span class="badge neutral" title="2022 ו-2021 לפי חלוקת השכונות של ועדת הבחירות, באחוזים בלבד.">נתוני ועדת הבחירות לשכונה</span>'
      : S5.q >= 2 ? '<span class="badge warn" title="אין קלפי מקבילה מדויקת; ההשוואה לפי מקום הקלפי הקרוב ב-2022.">⚠ השוואה משוערת</span>'
      : '<span class="badge ok" title="הקלפי שויכה לקלפי או למקום הקלפי המקביל ב-2022.">✓ השוואה אמינה</span>';
    var top22 = S5.s25 && Object.keys(S5.s25).sort(function (a, b) { return S5.s25[b] - S5.s25[a]; })[0];
    var line22 = top22 ? '<p class="hist-22">ב-2022 הרשימה הגדולה כאן הייתה <b>' + esc(top22) + "</b> עם " + bd(pct(S5.s25[top22])) + ".</p>" : "";
    var who = S5.src === "nb" ? "בשכונת " + esc(nb.name) : "באותן קלפיות";
    return '<section class="lvl" aria-labelledby="hist-h"><details class="fold" id="history"' + (mq.matches ? "" : " open") + '><summary><h2 class="sec" id="hist-h">השוואה ל-2022 ול-2021</h2>' + badge + "</summary>" +
      '<p class="sec-sub">' + who + ", לפי שם הרשימה, באחוזים מהקולות הכשרים. רשימות שהתאחדו, התפצלו או שינו שם אינן מושוות.</p>" + line22 +
      '<div class="viewtabs" role="group" aria-label="תצוגה"><button type="button" aria-pressed="true" data-view="dots">נקודות</button><button type="button" aria-pressed="false" data-view="mult">שלוש שנים</button><button type="button" aria-pressed="false" data-view="table">טבלה</button></div>' +
      '<div class="view" data-v="dots">' + dotPlot(S5) + '</div><div class="view" data-v="mult" hidden>' + multiples(S5) + '</div><div class="view" data-v="table" hidden>' + histTable(S5) + "</div>" +
      '<p class="chart-foot">מקור: ועדת הבחירות המרכזית' + (S5.src === "nb" ? " (שכונות)" : "") + '. <a href="#method-history">איך משווים?</a></p></details></section>';
  }
  function val(S5, y, n) { var sh = y === 25 ? S5.s25 : S5.s24, nm = y === 25 ? S5.n25 : S5.n24; return !sh ? undefined : !nm[n] ? null : sh[n] || 0; }
  function dotPlot(S5) {
    var mx = 0; S5.names.forEach(function (n) { [S5.now[n], val(S5, 25, n), val(S5, 24, n)].forEach(function (v) { if (v) mx = Math.max(mx, v); }); });
    mx = Math.min(1, Math.ceil(mx * 10) / 10) || 1;
    var ticks = []; for (var t = 0; t <= mx + 1e-9; t += mx > 0.5 ? 0.2 : 0.1) ticks.push(t);
    var rows = S5.names.map(function (n) {
      var v26 = S5.now[n], v25 = val(S5, 25, n), v24 = val(S5, 24, n), xs = [v26].concat(v25 != null ? [v25] : [], v24 != null ? [v24] : []);
      var lo = Math.min.apply(null, xs), hi = Math.max.apply(null, xs), P_ = function (v) { return (v / mx * 100).toFixed(2) + "%"; };
      var d = v25 != null ? pts((v26 - v25) * 100) : "—";
      var tip = "2026: " + pct(v26) + " · 2022: " + (v25 == null ? "לא התמודדה בשם זה" : pct(v25)) + " · 2021: " + (v24 == null ? "לא התמודדה בשם זה" : pct(v24));
      return '<li class="dp" title="' + esc(tip) + '"><span class="dp-name"><i class="chip" style="background:' + colorByName(n) + '"></i>' + esc(n) + '</span><span class="dp-trk" aria-hidden="true">' +
        '<span class="dp-line" style="inset-inline-start:' + P_(lo) + ";width:" + ((hi - lo) / mx * 100).toFixed(2) + '%"></span>' +
        (v24 != null ? '<span class="dot d24" style="inset-inline-start:' + P_(v24) + '"></span>' : "") + (v25 != null ? '<span class="dot d22" style="inset-inline-start:' + P_(v25) + '"></span>' : "") +
        '<span class="dot d26" style="inset-inline-start:' + P_(v26) + ";background:" + colorByName(n) + '"></span></span><span class="dp-v">' + bd(pct(v26)) + '</span><span class="dp-d">' + bd(d) + '</span><span class="sr-only">' + esc(tip) + "</span></li>";
    }).join("");
    return '<div class="dplot"><p class="dp-key"><span><span class="dot d24"></span>2021</span><span><span class="dot d22"></span>2022</span><span><span class="dot d26 key"></span>2026</span><span class="dp-key-d">שינוי מ-2022</span></p><ul>' + rows +
      '</ul><div class="dp-axis" aria-hidden="true">' + ticks.map(function (t) { return '<span style="inset-inline-start:' + (t / mx * 100).toFixed(2) + '%">' + Math.round(t * 100) + "%</span>"; }).join("") + "</div></div>";
  }
  function histTable(S5) {
    function cell(y, n) { var v = val(S5, y, n); return v === undefined ? "<td>—</td>" : v === null ? '<td class="na" title="לא התמודדה בשם זה">—</td>' : "<td>" + bd(pct(v)) + "</td>"; }
    return '<table class="cmp"><thead><tr><th scope="col">רשימה</th><th scope="col">2026</th><th scope="col">2022</th><th scope="col">שינוי (נק\')</th><th scope="col">2021</th></tr></thead><tbody>' + S5.names.map(function (n) {
      var v25 = val(S5, 25, n);
      return '<tr><th scope="row"><i class="chip" style="background:' + colorByName(n) + '"></i>' + esc(n) + "</th><td>" + bd(pct(S5.now[n])) + "</td>" + cell(25, n) + '<td class="d">' + (v25 != null ? bd(pts((S5.now[n] - v25) * 100)) : "") + "</td>" + cell(24, n) + "</tr>";
    }).join("") + "</tbody></table>";
  }
  // Small multiples: each year's own top 6 on one shared scale.
  function multiples(S5) {
    var cols = [["2021", "הכנסת ה-24", S5.s24], ["2022", "הכנסת ה-25", S5.s25], ["2026", "הכנסת ה-26", S5.now]];
    var mx = 0; cols.forEach(function (c) { if (c[2]) Object.keys(c[2]).forEach(function (n) { mx = Math.max(mx, c[2][n]); }); });
    mx = mx || 1;
    return '<div class="mult">' + cols.map(function (c, ci) {
      var body = !c[2] ? '<p class="mnote">אין נתונים</p>' : Object.keys(c[2]).sort(function (a, b) { return c[2][b] - c[2][a]; }).slice(0, 6).map(function (n) {
        var col = colorByName(n), v = c[2][n];
        return '<div class="mrow"><div class="ml"><span><i class="chip" style="background:' + col + '"></i>' + esc(n) + "</span><b>" + bd(pct(v)) + '</b></div><div class="mt" aria-hidden="true"><span class="mf" style="width:' + (v / mx * 100).toFixed(1) + "%;background:" + col + '"></span></div></div>';
      }).join("");
      return '<section class="mcol' + (ci === 2 ? " now" : "") + '" aria-label="' + c[0] + '"><h3>' + c[0] + '</h3><p class="msub">' + c[1] + "</p>" + body + "</section>";
    }).join("") + "</div>";
  }

  // Level 4: context (turnout here / locality / national, CBS area and SES strip).
  function contextHtml(near, sc) {
    if (!near.length) return "";
    var c = near[0].b.c, la = locAgg(c), lname = near[0].b.t;
    var rows = [["כאן", turnout(sc.A)], ["ב" + lname, turnout(la.A)], ["ארצי", NAT ? turnout(NAT) : 0]];
    var tb = '<ul class="tbars">' + rows.map(function (r) { return '<li><span class="tl">' + esc(r[0]) + '</span><span class="tt" aria-hidden="true"><span style="width:' + (r[1] * 100).toFixed(1) + '%"></span></span><span class="tv">' + bd(pct(r[1])) + "</span></li>"; }).join("") + "</ul>";
    var sa = "";
    var code = S ? saCode(near[0].b) : null, r = code && S.sa[code];
    if (r) {
      var strip = '<div class="ses-strip" aria-hidden="true">' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (i) { return '<i class="' + (i === r[2] ? "on" : "") + '" style="background:' + sesColor(i) + '"></i>'; }).join("") + "</div>";
      sa = '<h3 class="ctx-h">האזור הסטטיסטי של הקלפי הקרובה</h3><p class="meta">' + esc(saName(code)) + "</p>" + strip +
        '<p class="ses-v">' + (r[2] ? "אשכול <b>" + r[2] + "</b> מתוך 10" : "אשכול לא ידוע") + (r[5] ? " (ברמת היישוב)" : "") + '<span class="meta"> · 1 הנמוך ביותר · מקור: הלמ"ס, 2021</span></p>';
    }
    return '<section class="lvl" aria-labelledby="ctx-h"><details class="fold"><summary><h2 class="sec" id="ctx-h">הקשר: אחוז הצבעה ואשכול חברתי-כלכלי</h2></summary>' +
      '<h3 class="ctx-h">אחוז הצבעה</h3>' + tb + sa +
      '<p class="meta">אזור סטטיסטי ושכונה הם שתי חלוקות שונות; המספרים לא אמורים להיות זהים. השכונה נקבעת לפי מיקום הקלפיות, לא לפי מקום המגורים.</p></details></section>';
  }

  // Level 5: disclaimer and timestamp.
  function disclaimerHtml() {
    return '<aside class="disclaimer" aria-label="הבהרה"><p><b>אתר עצמאי ולא רשמי.</b> ההצבעה חשאית: התוצאות הן ברמת הקלפי ואינן מלמדות על אדם או על בניין מסוים. כל בוחר משובץ לקלפי לפי הכתובת הרשומה, לא לפי קרבה, לכן הקלפי הקרובה היא לא בהכרח שלכם. ' +
      '<a href="https://www.gov.il/apps/moin/bocharim/" target="_blank" rel="noopener">בדיקת הקלפי שלכם באתר הרשמי</a> · <a href="#method">איך זה עובד</a></p><p class="ts">' + esc(TS) + "</p></aside>";
  }

  function wireResults(R, near) {
    Array.prototype.forEach.call(R.querySelectorAll(".tomap"), function (b) {
      b.addEventListener("click", function () { focusPin(+b.getAttribute("data-i"), true); });
    });
    Array.prototype.forEach.call(R.querySelectorAll(".place"), function (li) {
      var i = +li.getAttribute("data-i");
      li.addEventListener("mouseenter", function () { hiPin(i, true); }); li.addEventListener("mouseleave", function () { hiPin(i, false); });
      li.addEventListener("focusin", function () { hiPin(i, true); }); li.addEventListener("focusout", function () { hiPin(i, false); });
      li.querySelector("details").addEventListener("toggle", function (e) { if (e.target.open) openPlace = i; else if (openPlace === i) openPlace = -1; });
    });
    Array.prototype.forEach.call(R.querySelectorAll(".viewtabs button"), function (b) {
      b.addEventListener("click", function () {
        var box = b.closest("details");
        Array.prototype.forEach.call(box.querySelectorAll(".viewtabs button"), function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
        Array.prototype.forEach.call(box.querySelectorAll(".view"), function (v) { v.hidden = v.getAttribute("data-v") !== b.getAttribute("data-view"); });
      });
    });
    Array.prototype.forEach.call(R.querySelectorAll("[data-act]"), function (b) { b.addEventListener("click", function () { act(b.getAttribute("data-act")); }); });
    Array.prototype.forEach.call(R.querySelectorAll(".klink"), function (b) {
      b.addEventListener("click", function () { copyText(location.origin + location.pathname + "?kalpi=" + encodeURIComponent(b.getAttribute("data-kalpi")), "הקישור הועתק"); });
    });
    var mv = $("moveLoc"); if (mv) mv.addEventListener("click", function () { var h = $("moveHint"); h.hidden = false; if (mq.matches) sheet.set("peek"); if (marker) marker.openTooltip(); });
    if (where && where.kalpi) { var pk = where.kalpi; var li = $("place-0"); if (li) { li.querySelector("details").open = true; openPlace = 0; var tr = li.querySelector('tr[data-k="' + CSS.escape(pk) + '"]'); if (tr) tr.classList.add("hi"); } }
  }
  var pendingKalpi = null;
  function hiPin(i, on) { var m = nearMarkers[i], el = m && m.getElement && m.getElement(); if (el) el.classList.toggle("hi", on); if (m && on) m.setZIndexOffset(900); else if (m) m.setZIndexOffset(0); }
  function focusPin(i, popup) {
    var m = nearMarkers[i]; if (!m) return;
    if (mq.matches) sheet.set("peek");
    var ll = m.getLatLng(), z = Math.max(map.getZoom(), 16);
    if (reduceMotion) map.setView(ll, z); else map.flyTo(ll, z, { duration: 0.8 });
    if (popup) map.once("moveend", function () { m.openPopup(); });
  }
  function openCard(i) {
    var li = $("place-" + i); if (!li) return;
    li.querySelector("details").open = true; openPlace = i;
    if (mq.matches && sheet.state !== "full") sheet.set("half");
    setTimeout(function () { sheet.scroller.scrollTo({ top: li.offsetTop - 12, behavior: reduceMotion ? "auto" : "smooth" }); li.querySelector("summary").focus({ preventScroll: true }); }, mq.matches ? 380 : 0);
  }

  // Copy link / share / citation / print.
  function toast(t) {
    var el = $("toast"); el.textContent = t; el.classList.add("on");
    clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove("on"); }, 2000);
  }
  function copyText(t, ok) {
    function fallback() { var i = document.createElement("textarea"); i.value = t; i.setAttribute("readonly", ""); i.style.position = "fixed"; i.style.opacity = "0"; document.body.appendChild(i); i.select(); try { document.execCommand("copy"); toast(ok); } catch (e) { toast("לא הצלחנו להעתיק"); } i.remove(); }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(function () { toast(ok); }, fallback); else fallback();
  }
  function act(a) {
    var url = location.href;
    if (a === "copy") copyText(url, "הקישור הועתק");
    else if (a === "share" && navigator.share) navigator.share({ title: document.title, text: lastAnswer, url: url }).catch(function () {});
    else if (a === "cite") copyText('"' + lastAnswer + '" מקור: ועדת הבחירות המרכזית, ' + TS.replace(/\.$/, "") + "; עיבוד: מפת הקלפיות " + url, "הציטוט הועתק");
    else if (a === "print") window.print();
    else if (a === "retry-extras") { extrasErr = false; if (lastNear) render(lastNear, lastLabel); var nr = lastNear; extras().then(function () { if (lastNear === nr && H) render(nr, lastLabel); }); }
  }

  // Empty state: national facts (regular ballot boxes only) and how to start.
  function renderEmpty() {
    if (!NAT || !NAT.valid) return;
    var nk = D.b.reduce(function (s, b) { return s + b.k.length; }, 0);
    $("results").innerHTML = '<div class="empty"><section class="answer national" aria-labelledby="nat-h"><h2 class="sec" id="nat-h">בכל הארץ</h2><p class="nat-facts">אחוז הצבעה <b>' + bd(pct(turnout(NAT))) + "</b> · " + bd(fmt(nk)) + " קלפיות ב-" + bd(fmt(D.b.length)) + " מקומות</p>" +
      partyBars(NAT, {}) + '<p class="meta">בקלפיות הרגילות, לא כולל מעטפות כפולות. <a href="#method">איך זה עובד</a></p></section>' +
      '<section class="explore"><h2 class="sec">גלו במפה</h2><div class="explore-btns"><button type="button" class="ghost" data-layer="nb:winner">הרשימה הגדולה בכל שכונה</button><button type="button" class="ghost" data-layer="nb:turnout">אחוז הצבעה לפי שכונה</button></div></section>' +
      '<h2 class="sec">איך זה עובד</h2><ol class="steps"><li>מקלידים רחוב, מספר ויישוב, או לוחצים על המפה.</li><li>מוצגים 5 מקומות הקלפי הקרובים ביישוב, עם התוצאות של כל קלפי.</li><li>משווים ל-2022 ול-2021, לשכונה ולאזור הסטטיסטי.</li></ol>' + disclaimerHtml() + "</div>";
    $("announce").textContent = "";
    Array.prototype.forEach.call($("results").querySelectorAll("[data-layer]"), function (b) {
      b.addEventListener("click", function () { $("layer").value = b.getAttribute("data-layer"); setLayer(b.getAttribute("data-layer")); if (mq.matches) sheet.set("peek"); });
    });
  }


  // ---------- v2: history (K25/K24) and statistical areas, lazy-loaded ----------
  var H = null, S = null, N = null, extrasP = null, lastNear = null, lastLabel = "", lastCtx = {}, lastNb = null;
  function extras() {
    if (!extrasP) extrasP = Promise.all([
      fetch("data/hist.json").then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }),
      fetch("data/sa.json").then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }),
      fetch("data/nb.json").then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    ]).then(function (a) { H = a[0]; S = a[1]; N = a[2]; extrasErr = false; },
      function () { extrasP = null; extrasErr = true; if (lastNear) render(lastNear, lastLabel); });
    return extrasP;
  }
  var extrasErr = false;
  function histWait(tag) { // "loading" while the comparison data loads; an error line with a retry when it failed
    return extrasErr ? '<' + tag + ' class="meta hist-err" role="status">לא הצלחנו לטעון את ההשוואה לבחירות קודמות. <button type="button" class="linkish" data-act="retry-extras">נסו שוב</button></' + tag + '>'
      : '<' + tag + ' class="meta hist-wait">טוענים השוואה לבחירות קודמות…</' + tag + '>';
  }
  // ---- CEC neighborhoods (polygons = the kalpiot whose polling location lies inside; K26 recomputed from our data) ----
  function nbOf(b) { if (!N) return null; for (var i = 0; i < b.k.length; i++) { var u = N.k[b.k[i][0]]; if (u) return u; } return null; }
  function nbShares(r, col, plist) { // shares by party he name for one election column of a neighborhood row
    var valid = r[col], vec = r[col + 1], sh = {}; if (!valid) return null;
    for (var i = 0; i < vec.length; i += 2) { var nm = pname(plist ? plist[vec[i]][1] : P[vec[i]][1]); sh[nm] = (sh[nm] || 0) + vec[i + 1] / valid; }
    return sh;
  }
  function pname(n) { return n.replace(/\s*\(לא התמודדה\)$/, ""); }
  var YEARS = [["25", "2022"], ["24", "2021"]];
  var QUAL = ["התאמה מדויקת לקלפי של 2022", "התאמה לפי מקום הקלפי", "משוערת: לפי מקום הקלפי הקרוב ב-2022", "קלפי או יישוב חדשים: אין נתונים קודמים"];
  // Shares for one past election over a set of K26 kalpiot. Groups that repeat a building/locality sum are counted once.
  function past(ks, y) {
    var E = H[y], gs = {}, q = 0, kinds = {}, col = y === "25" ? 0 : 2, missing = 0;
    ks.forEach(function (k) {
      var e = H.k[k[0]];
      if (!e || e[col] < 0) { missing++; return; }
      gs[e[col]] = 1; q = Math.max(q, e[col + 1]); kinds[E.groups[e[col]][0] ? 1 : 0] = 1;
    });
    var gl = Object.keys(gs);
    if (!gl.length) return { q: 3 };
    if ((kinds[0] && kinds[1]) || missing) q = Math.max(q, 2);
    var valid = 0, by = {};
    gl.forEach(function (g) {
      var G = E.groups[g]; if (G[0] === 2) q = Math.max(q, 2);
      valid += G[1];
      for (var i = 0; i < G[2].length; i += 2) { var nm = E.parties[G[2][i]][1]; by[nm] = (by[nm] || 0) + G[2][i + 1]; }
    });
    var sh = {}; Object.keys(by).forEach(function (n) { sh[n] = by[n] / valid; });
    return { q: q, sh: sh, names: E.names || (E.names = E.parties.reduce(function (o, p) { o[p[1]] = 1; return o; }, {})) };
  }
  function histHtml(ks, a) {
    if (!H) return histWait("div");
    var now = {}; a.parties.forEach(function (p) { now[pname(p.name)] = { s: p.v / a.valid, code: p.code }; });
    var ys = YEARS.map(function (y) { return past(ks, y[0]); });
    if (!ys[0].sh) return '<div class="meta">השוואה ל-2022: ' + QUAL[3] + ".</div>";
    var names = {};
    Object.keys(now).forEach(function (n) { if (now[n].s >= 0.02) names[n] = 1; });
    ys.forEach(function (y) { if (y.sh) Object.keys(y.sh).forEach(function (n) { if (y.sh[n] >= 0.03) names[n] = 1; }); });
    var rows = Object.keys(names).sort(function (x, z) { return ((now[z] || {}).s || 0) - ((now[x] || {}).s || 0) || ((ys[0].sh || {})[z] || 0) - ((ys[0].sh || {})[x] || 0); });
    function cell(y, n) { if (!y.sh) return "<td>—</td>"; if (!y.names[n]) return '<td class="na" title="לא התמודדה בשם זה">—</td>'; return "<td>" + pct(y.sh[n] || 0) + "</td>"; }
    var t = '<table class="cmp"><thead><tr><th>רשימה</th><th>2026</th><th>2022</th><th>שינוי</th><th>2021</th></tr></thead><tbody>' +
      rows.map(function (n) {
        var c = now[n] ? now[n].code : null, d = "";
        if (now[n] && ys[0].names[n]) { var dv = (now[n].s - (ys[0].sh[n] || 0)) * 100; d = (dv > 0 ? "+" : "") + dv.toFixed(1); }
        var ran26 = P.some(function (p) { return pname(p[1]) === n; });
        return "<tr><td>" + (c ? '<span class="sw" style="background:' + color(c) + '"></span>' : "") + esc(n) + "</td><td>" +
          (now[n] ? pct(now[n].s) : ran26 ? "0.0%" : '<span class="na" title="לא התמודדה בשם זה">—</span>') + "</td>" + cell(ys[0], n) + '<td class="d">' + d + "</td>" + cell(ys[1], n) + "</tr>";
      }).join("") + "</tbody></table>";
    var q = ys[0].q;
    return '<details class="hist"' + (ks.length > 1 || lastNear && lastNear[0] && lastNear[0].b.k === ks ? " open" : "") + "><summary>השוואה לבחירות 2022 ו-2021 (אחוזים בלבד)</summary>" + t +
      '<div class="meta' + (q >= 2 ? " approx" : "") + '">' + (q >= 2 ? "⚠ " : "") + QUAL[q] + '. ההשוואה לפי שם הרשימה; "—" = לא התמודדה באותו שם (רשימות שהתאחדו, התפצלו או שינו שם אינן מושוות).</div></details>';
  }
  function saCode(b) { if (!S) return null; for (var i = 0; i < b.k.length; i++) { var c = S.k[b.k[i][0]]; if (c) return c; } return null; }
  function saName(c) { var r = S.sa[c]; return r ? r[0] + (r[1] ? ", " + r[1] : " · אזור סטטיסטי " + (c % 10000)) : "אזור " + c; }
  // Choropleth layers, loaded on first use. Mode: "off" | "<src>:winner" | "<src>:p:<partyIdx>" | "sa:ses"; src = nb (CEC neighborhoods) or sa (CBS statistical areas).
  var layers = {}, layerP = {}, mode = "off", cur = null;
  // SES: one sequential teal hue (red/blue read as political in Israel).
  function sesColor(c) { var s = ["#e0f3f1", "#c2e4e1", "#a3d5d1", "#85c6c1", "#67b6b0", "#4aa6a0", "#2f958f", "#1a837e", "#0b6e6b", "#00585a"]; return c ? s[c - 1] : "#d9d9d9"; }
  var TURN_C = ["#f1eef6", "#c9c3d6", "#9a95b3", "#625f80", "#2b2d42"], SHARE_O = [0.12, 0.3, 0.48, 0.66, 0.85], BRK = null, USA = null;
  function saUnits() {
    if (USA || !S) return USA; USA = {};
    D.b.forEach(function (b) { b.k.forEach(function (k) { var c = S.k[k[0]]; if (c) (USA[c] || (USA[c] = [])).push(k); }); });
    Object.keys(USA).forEach(function (c) { USA[c] = aggregate(USA[c]); });
    return USA;
  }
  function unitTurnout(src, f) { var A = src === "sa" ? (saUnits() || {})[f.properties.c] : (nbAgg(f.properties.u) || {}).A; return A && A.eligible ? A.voters / A.eligible : null; }
  function cls(v, br) { var i = 0; while (i < br.length && v >= br[i]) i++; return i; }
  function computeBreaks(src, m) {
    var g = layers[src], vals = [];
    g.eachLayer(function (l) {
      var f = l.feature, x;
      if (m === "turnout") { x = unitTurnout(src, f); if (x != null) vals.push(x); }
      else if (m.slice(0, 2) === "p:") { x = rowOf(src, f); if (x && x[0]) vals.push(shareIn(x, +m.slice(2))); }
    });
    vals.sort(function (a, b) { return a - b; });
    if (!vals.length) return null;
    var q = function (p) { return vals[Math.min(vals.length - 1, Math.floor(p * vals.length))]; };
    if (m === "turnout") return [q(0.2), q(0.4), q(0.6), q(0.8)];
    var top = Math.max(q(0.95), 0.01); return [0.2, 0.4, 0.6, 0.8].map(function (t) { return top * t; });
  }
  function shareIn(x, pi) { for (var i = 0; i < x[1].length; i += 2) if (x[1][i] === pi) return x[1][i + 1] / x[0]; return 0; }
  function topoToGeo(t) { // TopoJSON (quantized, EPSG:3857) -> GeoJSON in WGS84
    var sx = t.transform.scale[0], sy = t.transform.scale[1], tx = t.transform.translate[0], ty = t.transform.translate[1];
    var arcs = t.arcs.map(function (a) { var x = 0, y = 0; return a.map(function (d) { x += d[0]; y += d[1]; var ll = merc2ll(x * sx + tx, y * sy + ty); return [ll[1], ll[0]]; }); });
    function ring(ix) { var pts = []; ix.forEach(function (i) { var a = i >= 0 ? arcs[i] : arcs[~i].slice().reverse(); pts = pts.concat(pts.length ? a.slice(1) : a); }); return pts; }
    var o = t.objects[Object.keys(t.objects)[0]];
    return { type: "FeatureCollection", features: o.geometries.filter(function (g) { return g.type === "Polygon" || g.type === "MultiPolygon"; }).map(function (g) {
      return { type: "Feature", properties: g.properties, geometry: { type: g.type, coordinates: g.type === "Polygon" ? g.arcs.map(ring) : g.arcs.map(function (p) { return p.map(ring); }) } };
    }) };
  }
  // row -> [valid, [pidx, votes...]] for K26
  function rowOf(src, f) { if (src === "sa") { var r = S.sa[f.properties.c]; return r && [r[3], r[4], r]; } var n = N.n[f.properties.u]; return n && [n[3], n[4], n]; }
  function style(f) {
    var src = mode.split(":")[0], m = mode.slice(src.length + 1), x = rowOf(src, f), st = { weight: 0.5, color: "#fff", fillOpacity: 0.62, renderer: renderer };
    if (m === "ses") { st.fillColor = x ? sesColor(x[2][2]) : "#d9d9d9"; st.fillOpacity = 0.7; return st; }
    if (m === "turnout") { var tv = unitTurnout(src, f); if (tv == null) return Object.assign(st, { fillColor: "#d9d9d9", fillOpacity: 0.15, dashArray: "2 3", color: "#999" }); st.fillColor = TURN_C[cls(tv, BRK || [])]; st.fillOpacity = 0.7; return st; }
    if (!x || !x[0]) return Object.assign(st, { fillColor: "#d9d9d9", fillOpacity: 0.15, dashArray: "2 3", color: "#999" });
    if (m === "winner") st.fillColor = color(P[x[1][0]][0]);
    else {
      var pi = +m.slice(2);
      st.fillColor = color(P[pi][0]); st.fillOpacity = SHARE_O[cls(shareIn(x, pi), BRK || [])];
    }
    return st;
  }
  function top4(x) { var h = []; for (var i = 0; i < x[1].length && h.length < 4; i += 2) h.push(esc(pname(P[x[1][i]][1])) + " " + pct(x[1][i + 1] / x[0])); return h.join(" · "); }
  function popup(src, f) {
    var x = rowOf(src, f); if (!x) return "";
    if (src === "sa") {
      var c = f.properties.c, r = x[2];
      return "<b>" + esc(saName(c)) + '</b><br>אשכול חברתי-כלכלי: ' + (r[2] || "?") + "/10" + (r[5] ? " (ברמת היישוב)" : "") + "<br>" + (x[0] ? top4(x) : "אין קלפי באזור זה");
    }
    return "<b>" + esc(x[2][2]) + ", " + esc(x[2][1]) + "</b> (שכונת ועדת הבחירות)<br>" + (x[0] ? top4(x) : "אין קלפי של 2026 בשכונה זו");
  }
  function load(src) {
    if (!layerP[src]) layerP[src] = Promise.all([extras(), fetch(src === "sa" ? "data/statareas.geojson" : "data/nb.topo.json").then(function (r) { return r.json(); })]).then(function (a) {
      if (src === "sa" ? !S : !N) throw new Error("extras");
      layers[src] = L.geoJSON(src === "sa" ? a[1] : topoToGeo(a[1]), { style: style, onEachFeature: function (f, l) { l.bindPopup(function () { return popup(src, f); }); l.on("click", function (e) { L.DomEvent.stopPropagation(e); }); } });
    });
    return layerP[src];
  }
  function setLayer(m, noUrl) {
    mode = m; dotColors(); if (!noUrl) setUrl(null, false);
    if (cur) { cur.remove(); cur = null; }
    if (m === "off") return legend();
    var src = m.split(":")[0];
    $("legend").textContent = "טוענים את השכבה…";
    load(src).then(function () {
      if (mode !== m) return; var mm = m.slice(src.length + 1); BRK = mm === "turnout" || mm.slice(0, 2) === "p:" ? computeBreaks(src, mm) : null;
      cur = layers[src]; cur.setStyle(style); cur.addTo(map); cur.bringToBack(); legend();
    }, function () { layerP[src] = null; toast("לא הצלחנו לטעון את השכבה."); mode = "off"; $("layer").value = "off"; legend(); dotColors(); setUrl(null, false); });
  }
  function legend() {
    var el = $("legend"); if (mode === "off") { el.innerHTML = ""; return; }
    var brk = function (fmtv, cols, op) { return '<span class="lg-steps">' + cols.map(function (c, i) { var lo = i ? BRK[i - 1] : 0; return '<span><i style="background:' + c + (op ? ";opacity:" + op[i] : "") + '"></i>' + (i ? fmtv(lo) + "+" : "&lt;" + fmtv(BRK[0])) + "</span>"; }).join("") + "</span>"; };
    var f0 = function (v) { return Math.round(v * 100) + "%"; };
    var src = mode.split(":")[0], m = mode.slice(src.length + 1), unit = src === "sa" ? 'אזור סטטיסטי (למ"ס)' : "שכונה (ועדת הבחירות)";
    var none = ' <span class="sw" style="background:#bbb;opacity:.4"></span>מקווקו = אין קלפי באזור זה.';
    if (m === "ses") el.innerHTML = 'אשכול חברתי-כלכלי (הלמ"ס, 2021), 1 הנמוך ביותר: <span class="lg-steps ses">' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (c) { return '<span><i style="background:' + sesColor(c) + '"></i>' + c + "</span>"; }).join("") + "</span>";
    else if (m === "winner") el.innerHTML = "הרשימה הגדולה בכל " + unit + " (2026). ברשימה: הרשימות שבתצוגה, לפי מספר האזורים." + '<span class="lg-list" id="lgList"></span>' + none;
    else if (m === "turnout") el.innerHTML = "אחוז הצבעה לפי " + unit + " (5 חמישונים):" + (BRK ? brk(f0, TURN_C) : "") + none;
    else { var pc = color(P[+m.slice(2)][0]); el.innerHTML = "אחוז ל" + esc(pname(P[+m.slice(2)][1])) + " מהקולות הכשרים, לפי " + unit + ":" + (BRK ? brk(function (v) { return (v * 100).toFixed(v < 0.1 ? 1 : 0) + "%"; }, [pc, pc, pc, pc, pc], SHARE_O) : "") + none; }
    if (m === "winner") winnerLegend();
  }
  // Lists in the visible area of the winner layer, sorted by how many areas they lead.
  function winnerLegend() {
    var el = $("lgList"); if (!el || !cur || !/:winner$/.test(mode)) return;
    var src = mode.split(":")[0], b = map.getBounds(), cnt = {};
    cur.eachLayer(function (l) { if (!l.getBounds || !b.intersects(l.getBounds())) return; var x = rowOf(src, l.feature); if (x && x[0]) { var pi = x[1][0]; cnt[pi] = (cnt[pi] || 0) + 1; } });
    var ks = Object.keys(cnt).sort(function (a, c) { return cnt[c] - cnt[a] || (P[a][1] < P[c][1] ? -1 : 1); }).slice(0, 8);
    el.innerHTML = ks.map(function (pi) { return '<span><i class="chip" style="background:' + color(P[pi][0]) + '"></i>' + esc(pname(P[pi][1])) + " <bdi>" + cnt[pi] + "</bdi></span>"; }).join("");
  }
  map.on("moveend", function () { if (/:winner$/.test(mode)) winnerLegend(); });
  // Party order is computed from national votes (not from the array order of parties[]).
  function layerSelect() {
    var sel = $("layer"); if (!sel) return;
    var idx = {}; P.forEach(function (p, i) { idx[p[0]] = i; });
    var ord = NAT.parties.filter(function (p) { return p.v / NAT.valid >= 0.01; }).map(function (p) { return idx[p.code]; });
    function parties(src) { return ord.map(function (i) { return '<option value="' + src + ":p:" + i + '">אחוז ל' + esc(pname(P[i][1])) + "</option>"; }).join(""); }
    sel.innerHTML = '<option value="off">ללא</option><optgroup label="לפי שכונה (ועדת הבחירות)"><option value="nb:winner">הרשימה הגדולה</option><option value="nb:turnout">אחוז הצבעה</option>' + parties("nb") +
      '</optgroup><optgroup label="לפי אזור סטטיסטי (למ&quot;ס)"><option value="sa:winner">הרשימה הגדולה</option><option value="sa:turnout">אחוז הצבעה</option><option value="sa:ses">אשכול חברתי-כלכלי</option>' + parties("sa") + "</optgroup>";
    sel.value = mode;
    sel.onchange = function () { setLayer(sel.value); };
  }

  // ---------- search ----------
  // Geocoder chain (see README): normalize -> Nominatim free text -> Nominatim structured (bounded to the city)
  // -> without "שדרות" -> Photon -> GovMap autocomplete (exact street+number only) -> settlement from the data -> local match.
  // One request per search step, at most 1 request/second per service, results cached, no search-as-you-type, no custom headers.
  var searchId = 0, last = {}, cache = {}, pending = false;
  function throttled(host, url, opts) {
    var key = url + (opts && opts.body || "");
    if (cache[key]) return cache[key];
    var wait = Math.max(0, 1100 - (Date.now() - (last[host] || 0)));
    last[host] = Date.now() + wait;
    cache[key] = new Promise(function (ok) { setTimeout(ok, wait); }).then(function () {
      // A hung geocoder must not stall the chain: abort after 6 s and move on to the next source.
      var ctl = typeof AbortController === "function" ? new AbortController() : null, tm = ctl && setTimeout(function () { ctl.abort(); }, 6000);
      var o = {}; for (var k in (opts || {})) o[k] = opts[k]; if (ctl) o.signal = ctl.signal;
      return fetch(url, o).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .finally(function () { if (tm) clearTimeout(tm); });
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
  var ALIASES = { "פ\"ת": "פתח תקווה", "ב\"ש": "באר שבע", "ראשל\"צ": "ראשון לציון", "ראשלצ": "ראשון לציון", "ראשל\"צ.": "ראשון לציון",
    "ר\"ג": "רמת גן", "ב\"ב": "בני ברק", "ק\"ש": "קריית שמונה", "ק\"ג": "קריית גת", "ק\"א": "קריית אתא", "ק. שמונה": "קריית שמונה", "ת\"א-יפו": "תל אביב-יפו", "ת\"א יפו": "תל אביב-יפו", "נצרת עילית": "נוף הגליל", "פתח תקוה": "פתח תקווה", "מודיעין מכבים רעות": "מודיעין-מכבים-רעות", "מודיעין": "מודיעין-מכבים-רעות", "בנימינה": "בנימינה-גבעת עדה", "ת\"א": "תל אביב-יפו", "תא": "תל אביב-יפו", "תל אביב": "תל אביב-יפו", "יפו": "תל אביב-יפו", "תל-אביב": "תל אביב-יפו",
    // Arabic and English city names (lower-case keys for Latin script).
    "القدس": "ירושלים", "حيفا": "חיפה", "يافا": "תל אביב-יפו", "تل أبيب": "תל אביב-יפו", "تل ابيب": "תל אביב-יפו", "الناصرة": "נצרת", "الناصره": "נצרת", "أم الفحم": "אום אל-פחם", "ام الفحم": "אום אל-פחם",
    "رهط": "רהט", "عكا": "עכו", "اللد": "לוד", "الرملة": "רמלה", "الطيبة": "טייבה", "الطيبه": "טייבה", "شفاعمرو": "שפרעם", "سخنين": "סח'נין", "طمرة": "טמרה", "الطيرة": "טירה", "كفر قاسم": "כפר קאסם", "بئر السبع": "באר שבע",
    "jerusalem": "ירושלים", "tel aviv": "תל אביב-יפו", "tel aviv-yafo": "תל אביב-יפו", "tel aviv yafo": "תל אביב-יפו", "jaffa": "תל אביב-יפו", "yafo": "תל אביב-יפו", "haifa": "חיפה", "beer sheva": "באר שבע", "beersheba": "באר שבע", "be'er sheva": "באר שבע",
    "nazareth": "נצרת", "eilat": "אילת", "netanya": "נתניה", "ashdod": "אשדוד", "ashkelon": "אשקלון", "herzliya": "הרצליה", "raanana": "רעננה", "ra'anana": "רעננה", "kfar saba": "כפר סבא", "rehovot": "רחובות", "rishon lezion": "ראשון לציון", "rishon letzion": "ראשון לציון",
    "petah tikva": "פתח תקווה", "petah tiqva": "פתח תקווה", "ramat gan": "רמת גן", "givatayim": "גבעתיים", "holon": "חולון", "bat yam": "בת ים", "bnei brak": "בני ברק", "modiin": "מודיעין-מכבים-רעות", "modi'in": "מודיעין-מכבים-רעות", "nahariya": "נהרייה", "akko": "עכו", "acre": "עכו",
    "tiberias": "טבריה", "safed": "צפת", "tzfat": "צפת", "karmiel": "כרמיאל", "afula": "עפולה", "hadera": "חדרה", "lod": "לוד", "ramla": "רמלה", "rahat": "רהט", "umm al-fahm": "אום אל-פחם", "umm al fahm": "אום אל-פחם", "dimona": "דימונה", "ariel": "אריאל", "kiryat shmona": "קריית שמונה", "beit shemesh": "בית שמש" };
  function alias(c) { var t = c.trim(); return ALIASES[t] || ALIASES[plain(t)] || ALIASES[t.toLowerCase()] || ALIASES[plain(t).toLowerCase()] || null; }

  function normalize(q) {
    var s = q.replace(/[\u0591-\u05C7]/g, "").replace(/[،؛]/g, ",").replace(/״/g, '"').replace(/[׳`’]/g, "'").replace(/[–־]/g, "-").replace(/\s+/g, " ").trim();
    s = s.replace(/(^|,\s*)(רחוב|רח'|רח\.|רח|شارع|street|st\.)\s+/gi, "$1");
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
      var L0 = LOC[b.t] || (LOC[b.t] = { name: b.t, c: b.c, n: 0, y: 0, x: 0, s: 90, w: 180, nn: -90, e: -180, k: 0 });
      L0.n++; L0.k += b.k.length; L0.y += b.y; L0.x += b.x;
      L0.s = Math.min(L0.s, b.y); L0.nn = Math.max(L0.nn, b.y); L0.w = Math.min(L0.w, b.x); L0.e = Math.max(L0.e, b.x);
    });
    Object.keys(LOC).forEach(function (k) { var o = LOC[k]; o.y /= o.n; o.x /= o.n; });
    return LOC;
  }
  // Exact after folding finals, punctuation and doubled yod/vav (נהרייה = נהריה, קריית = קרית). With fuzzy, also one
  // edit away, but only for names of 5+ letters and only when exactly one locality is that close. (The old vowel-less
  // skeleton matched נהרייה to נהורה and בית חנינא to localities nowhere near Jerusalem.)
  function fold(s) { return plain(s).replace(/[ךםןףץ]/g, function (c) { return { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" }[c]; }).replace(/יי/g, "י").replace(/וו/g, "ו"); }
  function lev1(a, b) { // edit distance <= 1
    if (a === b) return true; var la = a.length, lb = b.length; if (Math.abs(la - lb) > 1) return false;
    var i = 0; while (i < la && i < lb && a[i] === b[i]) i++;
    return la === lb ? a.slice(i + 1) === b.slice(i + 1) : la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
  }
  function findLoc(city, fuzzy) {
    if (!city) return null;
    var c = alias(city) || city, L = localities(), names = Object.keys(L), fc = fold(c), i, best = null;
    for (i = 0; i < names.length; i++) if (fold(names[i]) === fc || fold(names[i].split(/\s+-\s+/)[0]) === fc) { if (!best || L[names[i]].k > best.k) best = L[names[i]]; }
    if (best || !fuzzy || fc.replace(/\s/g, "").length < (fuzzy === true ? 5 : fuzzy)) return best;
    var hits = names.filter(function (nm) { return lev1(fold(nm), fc) || lev1(fold(nm.split(/\s+-\s+/)[0]), fc); });
    return hits.length === 1 ? L[hits[0]] : null;
  }
  // "Did you mean" for a lone name that is one edit away from a locality but not an exact match (צפאת -> צפת).
  // Shown as buttons; never applied automatically for short names (גילה is one edit from both שילה and גאליה).
  function suggest(n, p) {
    var el = $("alts"); el.innerHTML = "";
    if (p.num || /,/.test(n)) return;
    var fq = fold(alias(n) || n); if (fq.replace(/\s/g, "").length < 3) return;
    var L = localities(), exact = p.loc && fold(p.loc.name) === fq;
    var hits = Object.keys(L).filter(function (nm) { var f = fold(nm), f0 = fold(nm.split(/\s+-\s+/)[0]); return f !== fq && f0 !== fq && (lev1(f, fq) || lev1(f0, fq)); })
      .filter(function (nm) { return !p.loc || nm !== p.loc.name; }).sort(function (a, b) { return L[b].k - L[a].k; }).slice(0, 3);
    if (!hits.length || exact) return;
    el.innerHTML = '<span class="alts-q">האם התכוונתם ליישוב:</span>' + hits.map(function (nm) { return '<button type="button" data-q="' + esc(nm) + '">' + esc(nm) + "</button>"; }).join("");
    Array.prototype.forEach.call(el.querySelectorAll("button"), function (b) { b.addEventListener("click", function () { $("q").value = b.getAttribute("data-q"); search(); }); });
  }
  // Split "<street> <num>, <city>" (comma optional).
  function parse(n) {
    var street = n, city = "", loc = null, m;
    var parts = n.split(/\s*,\s*/);
    if (parts.length > 1) { city = parts.pop(); street = parts.join(" "); loc = findLoc(city, true); }
    else {
      var w = n.split(" ");
      for (var k = Math.min(4, w.length); k >= 1 && !loc; k--) {
        // Without a comma only exact names count, except a whole query of one 4+ letter name (a misspelt locality).
        var cand = w.slice(w.length - k).join(" "), l = findLoc(cand, k === w.length ? 4 : false);
        if (l) { loc = l; city = cand; street = w.slice(0, w.length - k).join(" "); }
      }
    }
    if (alias(city)) city = alias(city);
    if (loc && /[A-Za-z\u0600-\u06FF]/.test(city)) city = loc.name; // Arabic/Latin city -> the Hebrew name the geocoders use
    var num = null;
    if ((m = street.match(/(^|\s)(\d+)[א-ת]?(?=\s|$)/))) { num = m[2]; street = (street.slice(0, m.index) + " " + street.slice(m.index + m[0].length)).replace(/\s+/g, " ").trim(); }
    return { street: street, num: num, city: city, loc: loc };
  }
  function cityOk(names, p) {
    if (!p.city) return true;
    // Compare whole words only: every run of consecutive words of each name, as a skeleton. (Skeleton substrings
    // matched "מועצה אזורית חוף הכרמל" to חיפה, since חוף ה... folds to the same letters.)
    function runs(nm) { var w = plain(nm).split(" "), out = {}, i, j; for (i = 0; i < w.length; i++) for (j = i + 1; j <= Math.min(w.length, i + 4); j++) { var k = skel(w.slice(i, j).join(" ")); if (k.length >= 2) out[k] = 1; } return out; }
    var want = runs(p.city); if (p.loc) { var r1 = runs(p.loc.name); for (var k1 in r1) want[k1] = 1; }
    var whole = [skel(p.city)].concat(p.loc ? [skel(p.loc.name), skel(p.loc.name.split(/\s+-\s+/)[0])] : []);
    return names.some(function (nm) {
      if (!nm) return false; var s = skel(nm), r = runs(nm);
      if (whole.indexOf(s) >= 0) return true;
      return whole.some(function (w) { return w.length >= 2 && r[w]; }) || (s.length >= 2 && want[s]);
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
        // A park, school or shop named after the street ("גן הרצל") is not the street: only places/boundaries count as areas.
        if (prec === "area" && p.street && r.category !== "place" && r.category !== "boundary") continue;
        if (prec === "area" && p.num) continue;
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
        // a fuzzy hit with no street must share at least one word with the query (ואדי אל נעם -> נחל פצאל is not a match)
        if (p.street && !pr.street && !p.street.split(/\s+/).some(function (w) { w = skel(w); return w.length >= 3 && skel(pr.name || "").indexOf(w) >= 0; })) continue;
        var prec = pr.housenumber ? "house" : pr.type === "street" ? "street" : "area";
        // With a street typed, a POI (park, school, shop) that merely shares a word is not an answer.
        if (prec === "area" && p.street && (p.num || (pr.osm_key !== "place" && pr.osm_key !== "boundary"))) continue;
        if (prec === "street" && p.street && !pr.street && sskel(pr.name || "") !== sskel(p.street.replace(/^(שדרות|שכונת)\s+/, ""))) continue;
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

  // CEC election search (the geocoder behind elections.govmap.gov.il; CORS *). Results: t 1 address, 2 street,
  // 3 neighborhood, 4 settlement; x/y EPSG:3857; c locality code; h CEC neighborhood id. It is fuzzy ("הרצל 30" can
  // return "אצ"ל 30"), so an address is accepted only when its street (or alias) and number equal what was typed,
  // its locality matches, and the street is on the official street list of that locality (data.gov.il dataset 321).
  function cecQ(s) {
    return s.replace(/[\u0591-\u05C7]/g, "").replace(/[״“”]/g, '"').replace(/[׳‘’`]/g, "'").replace(/[^\p{L}\p{N}"' ]+/gu, " ")
      .replace(/\s+/g, " ").trim().toLowerCase().slice(0, 100);
  }
  function merc2ll(x, y) { return [(2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) * 180 / Math.PI, x / 6378137 * 180 / Math.PI]; }
  var streetsP = {};
  function officialStreets(c) { // Set of sskel(street) for locality c, or null when the list is unavailable
    if (!streetsP[c]) streetsP[c] = throttled("datagov", "https://data.gov.il/api/3/action/datastore_search?resource_id=9ad3862c-8391-4b2f-84a4-2d4c68625f4b&limit=5000&fields=" +
      encodeURIComponent("שם_רחוב") + "&filters=" + encodeURIComponent(JSON.stringify({ "סמל_ישוב": c }))).then(function (r) {
      var set = {}; ((r.result || {}).records || []).forEach(function (x) { set[sskel(x["שם_רחוב"] || "")] = 1; });
      if (!Object.keys(set).length) { delete streetsP[c]; return null; }
      return set;
    }, function () { delete streetsP[c]; return null; });
    return streetsP[c];
  }
  function locByCode(c) { var L = localities(); for (var k in L) if (L[k].c === c) return L[k]; return null; }
  function cec(n, p) {
    var q = cecQ(n.replace(/(^|\s)(שכונת|שכונה|שכ')\s+/, "$1")); if ((q.match(/\p{L}/gu) || []).length < 2) return Promise.resolve(null);
    return throttled("cec", "https://d3i80z2x83yp3b.cloudfront.net/search?q=" + encodeURIComponent(q)).then(function (res) {
      res = Array.isArray(res) ? res : [];
      var nbq = /^(שכונת|שכונה|שכ')\s/.test(p.street || "");
      var st = p.street ? sskel(p.street.replace(/^(שדרות|שכונת|שכונה|שכ')\s+/, "")) : "", locOk = function (r) { return p.loc ? r.c === p.loc.c : !p.city || cityOk([(r.n || "").split(", ").pop()], p); };
      function hit(r, prec) { var ll = merc2ll(r.x, r.y), l = locByCode(r.c); return { lat: ll[0], lon: ll[1], label: r.n, prec: prec, src: "ועדת הבחירות (חיפוש כתובות)", c: r.c, nb: r.h || null, cname: l && l.name }; }
      function stMatch(lbl) { var m = (lbl || "").split(", ")[0].match(/^(.*?)(?:\s(\d+)[א-ת]?)?$/); return m && { s: sskel(m[1].replace(/^שדרות\s+/, "")), n: m[2] || null }; }
      var cands = [];
      res.forEach(function (r) {
        if (!locOk(r)) return;
        if (r.t === 1 && p.num) {
          var a = stMatch(r.n), b = stMatch(r.a);
          if ((a && a.s === st && a.n === String(p.num)) || (b && b.s === st && b.n === String(p.num))) cands.push([0, r, "house"]);
        } else if (r.t === 2 && st) {
          var a2 = stMatch(r.n), b2 = stMatch(r.a);
          if ((a2 && a2.s === st) || (b2 && b2.s === st)) cands.push([1, r, "street"]);
        } else if (r.t === 3 && !p.num && st && sskel(r.n.split(", ")[0]) === st) cands.push([nbq ? 0 : 2, r, "area"]);
        else if (r.t === 3 && !p.num && nbq && sskel(r.n.split(", ")[0].split(" ")[0]) === st) cands.push([0.5, r, "area"]);
      });
      cands.sort(function (a, b) { return a[0] - b[0]; });
      if (!cands.length) return null;
      var r0 = cands[0];
      if (r0[2] === "area") return hit(r0[1], "area");
      return officialStreets(r0[1].c).then(function (set) {
        // When the official list is reachable, the street must be on it (defends against fuzzy substitutions).
        if (set && !set[st] && !set[sskel(p.street)]) return null;
        return hit(r0[1], r0[2]);
      });
    });
  }

  var PREC = { house: "כתובת מדויקת", street: "רחוב בלבד (מספר הבית לא נמצא)", area: "שכונה/אזור", settlement: "מרכז היישוב", local: "לפי כתובת קלפי תואמת" };

  // Offline street index (kalpi-geocode.js + geo/: OSM house numbers and streets, the data.gov.il street list, CEC
  // neighborhoods). Answers exact addresses with no network and is the fallback when every online geocoder fails.
  var GEO = null, OFFSRC = "אינדקס הרחובות של האתר (OpenStreetMap, data.gov.il)";
  var RANKP = { house: 6, interp: 5, street: 4, estreet: 3, area: 2, settlement: 1 };
  function geoIdx() { if (!GEO && window.KalpiGeo) try { GEO = window.KalpiGeo.create({ base: "geo/" }); } catch (e) {} return GEO; }
  function inLocBox(r, l, m) { return r.lat >= l.s - m && r.lat <= l.nn + m && r.lon >= l.w - m && r.lon <= l.e + m; }
  // Centroid of the polling places on a street (used when the street is on the official list but has no coordinates).
  function venuesOn(c, street) {
    var k = sskel(street), pts = D.b.filter(function (b) { return b.c === c && sskel(b.a.split(",")[0]) === k; });
    if (!pts.length) return null;
    return { lat: pts.reduce(function (a, b) { return a + b.y; }, 0) / pts.length, lon: pts.reduce(function (a, b) { return a + b.x; }, 0) / pts.length };
  }
  // Arabic street names -> Hebrew letters, the way Israeli street lists transliterate them (صلاح الدين -> צלאח אלדין),
  // so the index's Hebrew names and their skeletons match (סלאח אל-דין).
  var AR2HE = { "ا": "א", "أ": "א", "إ": "א", "آ": "א", "ء": "א", "ئ": "א", "ى": "א", "ب": "ב", "ت": "ת", "ث": "ת'", "ج": "ג'", "ح": "ח", "خ": "ח'",
    "د": "ד", "ذ": "ד'", "ر": "ר", "ز": "ז", "س": "ס", "ش": "ש", "ص": "צ", "ض": "ד'", "ط": "ט", "ظ": "ט'", "ع": "ע", "غ": "ע'", "ف": "פ",
    "ق": "ק", "ك": "כ", "ل": "ל", "م": "מ", "ن": "נ", "ه": "ה", "ة": "ה", "و": "ו", "ؤ": "ו", "ي": "י" };
  function arToHe(s) {
    if (!/[\u0600-\u06FF]/.test(s)) return s;
    return s.replace(/[\u064B-\u065F\u0640]/g, "").replace(/(^|\s)شارع\s+/g, "$1").replace(/[\u0621-\u064A]/g, function (c) { return AR2HE[c] || ""; })
      .replace(/(^|\s)אל(?=\S{2})/g, "$1אל-").replace(/[כמנפצ](?=\s|$)/g, function (c) { return { "כ": "ך", "מ": "ם", "נ": "ן", "פ": "ף", "צ": "ץ" }[c]; });
  }
  function offline(n, p) {
    var g = geoIdx(); if (!g || !p.street) return Promise.resolve(null);
    // Give the index the locality this app already resolved (its own skeleton lookup maps נהרייה to נהורה).
    var st = arToHe(p.street);
    var q = p.loc ? st + (p.num ? " " + p.num : "") + ", " + p.loc.name : n;
    return g.search(q).then(function (r) {
      if (!r || (p.loc ? r.c !== p.loc.c : !locByCode(r.c))) return null;
      // Not an exact street name: fuzzy-match only among the streets of this one locality. Correct it silently only
      // when a single street is a clear winner; otherwise leave it to the "did you mean" buttons.
      if (p.loc && (r.fuzzy || (r.score || 0) < 0.8 || (r.prec === "settlement" && !r.street))) {
        return scopedFuzzy(p.loc.c, p.street).then(function (fx) {
          if (!fx.fix) return conv(r);
          return g.search(fx.fix + (p.num ? " " + p.num : "") + ", " + p.loc.name).then(function (r2) {
            if (!r2 || r2.c !== p.loc.c || r2.fuzzy || (r2.score || 0) < 0.95) return conv(r);
            var o = conv(r2); if (o && o.prec) { o.fixed = fx.fix; o.why = ("תיקנו את שם הרחוב ל\u201D" + fx.fix + "\u201C. " + (o.why || "")).trim(); }
            return o;
          });
        });
      }
      return conv(r);
    })["catch"](function () { return null; });
    function conv(r) {
      var l = locByCode(r.c), base = { c: r.c, src: OFFSRC, off: true, score: r.score || 0, street: r.street };
      function mk(lat, lon, prec, label, why, vc) { var o = { lat: lat, lon: lon, prec: prec, label: label, why: why || "", vc: !!vc }; for (var k in base) o[k] = base[k]; return o; }
      if (r.prec === "settlement") {
        if (!r.street) return { none: true, c: r.c };
        var v = venuesOn(r.c, r.street);
        if (v) return mk(v.lat, v.lon, "estreet", r.street + ", " + r.cname, "הרחוב " + r.street + " נמצא ברשימת הרחובות הרשמית, אבל לא מיקום הבית. הנקודה משוערת לפי הקלפיות שברחוב.", true);
        return { nameOnly: r.street, c: r.c };
      }
      if (r.fuzzy || base.score < 0.8) return { none: true, c: r.c, alts: [r.street].concat(r.alts || []).filter(Boolean) };
      if (r.prec === "neighborhood") return mk(r.lat, r.lon, "area", r.label);
      if (r.prec === "street") return mk(r.lat, r.lon, p.num ? "estreet" : "street", r.label, p.num ? "מספר הבית " + p.num + " לא נמצא. המיקום משוער לפי הרחוב " + r.street + "." : "");
      return mk(r.lat, r.lon, r.prec, r.label, r.prec === "interp" ? "המיקום משוער לפי מספרי הבתים הסמוכים ברחוב." : "");
    }
  }
  // ---------- Street candidates of ONE locality (shared by the fuzzy fixer and the typeahead) ----------
  // Folding: niqqud, finals, punctuation, doubled yod/vav (ktiv male/haser), lowercase. sk adds the vowel-less skeleton.
  function acFold(s) { return fold(String(s || "").replace(/[\u0591-\u05C7]/g, "")).toLowerCase(); }
  var STC = {};
  function streetList(c) {
    var g = geoIdx(); if (!g) return Promise.resolve([]);
    if (STC[c]) return STC[c];
    STC[c] = g.shard(c).then(function (d) {
      var seen = {}, out = [];
      d.streets.forEach(function (st) {
        var nm = st.names[0]; if (!nm || /^\d+$/.test(nm)) return;
        var heb = /[\u05D0-\u05EA]/.test(nm), key = acFold(nm).replace(/ (street|st|road|rd|avenue|ave|blvd|boulevard)$/, "");
        if (seen[key]) { seen[key].n.push.apply(seen[key].n, st.names.slice(1)); return; }
        var o = { name: nm, heb: heb, n: st.names.slice(1), f: key, sk: sskel(nm), geo: st.x != null };
        seen[key] = o; out.push(o);
      });
      out.forEach(function (o) {
        o.af = o.n.map(acFold).filter(function (x) { return x && x !== o.f; });
        o.w = (" " + o.f + " " + o.af.join(" ")); // word-start search haystack
      });
      return out;
    }, function () { delete STC[c]; return []; });
    return STC[c];
  }
  function dlev(a, b, max) { // Damerau-Levenshtein (optimal string alignment) with an early exit
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var d = [], i, j;
    for (i = 0; i <= a.length; i++) d[i] = [i];
    for (j = 0; j <= b.length; j++) d[0][j] = j;
    for (i = 1; i <= a.length; i++) {
      var mn = 1e9;
      for (j = 1; j <= b.length; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        if (d[i][j] < mn) mn = d[i][j];
      }
      if (mn > max) return max + 1;
    }
    return d[a.length][b.length];
  }
  function stripType(f) { return f.replace(/^(רחוב|רח|שדרות|שד|שדרת|דרך|סמטת|סמטה|כיכר|ככר|שביל|משעול|street|st|شارع) /, ""); }
  // Fuzzy candidates in the locality's own streets: [{o, d, n}] best first. d = edit distance, n = d / length.
  function fuzzyIn(list, q) {
    var f = acFold(q), f2 = stripType(f), out = [], max = f.length >= 9 ? 2 : 1;
    if (f.length < 3) return out;
    list.forEach(function (o) {
      var best = 99;
      [o.f].concat(o.af).forEach(function (t) {
        var d = Math.min(dlev(f, t, max), dlev(f2, stripType(t), max));
        if (d < best) best = d;
      });
      if (best <= max) out.push({ o: o, d: best, n: best / Math.max(f.length, 1) });
    });
    return out.sort(function (a, b) { return a.d - b.d || (b.o.heb - a.o.heb) || (b.o.geo - a.o.geo) || a.o.f.length - b.o.f.length; });
  }
  // A typo is auto-corrected only when ONE street of that locality is the clear winner (no other at the same distance),
  // the word is long enough for one edit (5+ letters) or two edits (9+), and the match is not exact already.
  function scopedFuzzy(c, street) {
    return streetList(c).then(function (list) {
      var f = acFold(street); if (!f) return {};
      if (list.some(function (o) { return o.f === f || o.sk === sskel(street); })) return {};
      var h = fuzzyIn(list, street);
      if (!h.length) return {};
      var b = h[0], len = f.length, core = stripType(b.o.f);
      // "ככר דיזנגוף" is the same name as "דיזנגוף" with a type word: not a rival candidate.
      h = [b].concat(h.slice(1).filter(function (x) { return stripType(x.o.f) !== core; }));
      var clear = (!h[1] || h[1].d > b.d) && b.d >= 1 && ((b.d === 1 && len >= 5) || (b.d === 2 && len >= 9));
      return { fix: clear && b.o.heb ? b.o.name : null, alts: h.slice(0, 4).map(function (x) { return x.o.name; }) };
    });
  }

  // ---------- Typeahead: an ARIA 1.2 combobox. Localities first; once a locality is known, its streets. ----------
  var AC = { opts: [], act: -1, seq: 0, locs: null, stats: [] };
  window.kalpiAcStats = AC.stats;
  function acLocs() {
    if (AC.locs) return AC.locs;
    var L = localities(), out = [];
    Object.keys(L).forEach(function (nm) { out.push({ l: L[nm], name: nm, w: " " + acFold(nm).replace(/-/g, " ") }); });
    Object.keys(ALIASES).forEach(function (a) { var l = findLoc(ALIASES[a]); if (l) out.push({ l: l, name: l.name, w: " " + acFold(a), alias: a }); });
    return (AC.locs = out);
  }
  function acRank(w, q) { // 0: starts with q, 1: a later word starts with q, 2: contains q, -1: no match
    var i = w.indexOf(" " + q); if (i === 0) return 0; if (i > 0) return 1; return q.length >= 3 && w.indexOf(q) > 0 ? 2 : -1;
  }
  function acCompute(v) {
    var n = normalize(v), p = parse(n), comma = /,/.test(v);
    if (p.loc && p.street) return { mode: "street", p: p };
    var tail = comma ? v.split(",").pop() : v, street = comma ? v.slice(0, v.lastIndexOf(",")).trim() : "";
    var q = acFold(normalize(tail)).replace(/-/g, " ").trim();
    if (q.length < 2) return { mode: "none" };
    var seen = {}, hits = [];
    acLocs().forEach(function (e) { var r = acRank(e.w, q); if (r >= 0) hits.push({ e: e, r: r }); });
    hits.sort(function (a, b) { return a.r - b.r || b.e.l.k - a.e.l.k; });
    var opts = [];
    hits.forEach(function (h) {
      if (seen[h.e.name] || opts.length >= 7) return; seen[h.e.name] = 1;
      opts.push({ kind: "loc", text: h.e.name, sub: h.e.alias ? h.e.alias : "יישוב", street: normalize(street), l: h.e.l });
    });
    return { mode: "loc", opts: opts };
  }
  function acStreets(list, p) {
    var q = acFold(p.street).replace(/-/g, " ").trim(), q2 = stripType(q), sk = sskel(p.street), hits = [];
    if (!q) return [];
    list.forEach(function (o) {
      var r = acRank(o.w, q); if (r < 0 && q2 !== q) r = acRank(o.w, q2);
      if (r < 0 && sk.length >= 3 && o.sk.indexOf(sk) === 0) r = 1.5; // ktiv male/haser: וייצמן = ויצמן
      if (r >= 0) hits.push({ o: o, r: r });
    });
    if (hits.length < 3) fuzzyIn(list, p.street).slice(0, 4).forEach(function (h) { if (!hits.some(function (x) { return x.o === h.o; })) hits.push({ o: h.o, r: 3 + h.n, fz: true }); });
    hits.sort(function (a, b) { return a.r - b.r || (b.o.heb - a.o.heb) || (b.o.geo - a.o.geo) || a.o.f.length - b.o.f.length; });
    return hits.slice(0, 7).map(function (h) {
      var alias = !h.o.heb ? "" : (acRank(" " + h.o.f, q) < 0 && h.o.n.filter(function (x) { return acRank(" " + acFold(x), q) >= 0; })[0]) || "";
      return { kind: "street", text: h.o.name + (p.num ? " " + p.num : "") + ", " + p.loc.name, name: h.o.name, sub: h.fz ? "האם התכוונתם?" : alias, num: p.num, l: p.loc };
    });
  }
  function acRender(opts) {
    var ul = $("qList"), inp = $("q");
    AC.opts = opts; AC.act = -1;
    if (!opts.length) { ul.hidden = true; ul.innerHTML = ""; inp.setAttribute("aria-expanded", "false"); inp.removeAttribute("aria-activedescendant"); return; }
    ul.innerHTML = opts.map(function (o, i) {
      return '<li role="option" id="qo' + i + '" aria-selected="false" class="ac-' + o.kind + '"><bdi>' + esc(o.text) + "</bdi>" + (o.sub ? '<span class="ac-sub">' + esc(o.sub) + "</span>" : "") + "</li>";
    }).join("");
    ul.hidden = false; inp.setAttribute("aria-expanded", "true");
  }
  function acSet(i) {
    var inp = $("q"), lis = $("qList").children;
    if (AC.act >= 0 && lis[AC.act]) lis[AC.act].setAttribute("aria-selected", "false");
    AC.act = i;
    if (i >= 0 && lis[i]) { lis[i].setAttribute("aria-selected", "true"); inp.setAttribute("aria-activedescendant", "qo" + i); lis[i].scrollIntoView({ block: "nearest" }); }
    else inp.removeAttribute("aria-activedescendant");
  }
  function acClose() { acRender([]); AC.seq++; }
  function acChoose(o) {
    var inp = $("q");
    acClose();
    if (o.kind === "loc") {
      if (!o.street) { inp.value = o.text; return search(); }
      inp.value = o.street + ", " + o.text;
      if (/\d/.test(o.street)) return search();
      inp.focus(); inp.setSelectionRange(o.street.length, o.street.length); return acUpdate();
    }
    if (o.num) { inp.value = o.text; return search(); }
    // No house number yet: put the caret after the street name, ready for the number.
    inp.value = o.name + " , " + o.l.name; inp.focus(); inp.setSelectionRange(o.name.length + 1, o.name.length + 1);
  }
  function acUpdate() {
    if (!D) return;
    var v = $("q").value, seq = ++AC.seq, t0 = performance.now(), r = acCompute(v);
    if (r.mode === "none") { AC.stats.push(performance.now() - t0); return acRender([]); }
    if (r.mode === "loc") { acRender(r.opts); AC.stats.push(performance.now() - t0); return; }
    var c = r.p.loc.c;
    if (STC[c] && STC[c].v) { acRender(acStreets(STC[c].v, r.p)); AC.stats.push(performance.now() - t0); return; }
    streetList(c).then(function (list) {
      STC[c].v = list;
      if (seq !== AC.seq) return;
      var t1 = performance.now(); acRender(acStreets(list, r.p)); AC.stats.push(performance.now() - t1);
    });
  }
  function acInit() {
    var inp = $("q"), ul = document.createElement("ul");
    ul.id = "qList"; ul.className = "aclist"; ul.setAttribute("role", "listbox"); ul.setAttribute("aria-label", "הצעות"); ul.hidden = true;
    inp.parentNode.appendChild(ul);
    inp.setAttribute("role", "combobox"); inp.setAttribute("aria-autocomplete", "list"); inp.setAttribute("aria-expanded", "false");
    inp.setAttribute("aria-controls", "qList"); inp.setAttribute("autocomplete", "off");
    inp.addEventListener("input", acUpdate);
    inp.addEventListener("keydown", function (e) {
      var n = AC.opts.length;
      if (e.key === "ArrowDown") { if (!n) { acUpdate(); return; } e.preventDefault(); acSet((AC.act + 1) % n); }
      else if (e.key === "ArrowUp" && n) { e.preventDefault(); acSet(AC.act <= 0 ? n - 1 : AC.act - 1); }
      else if (e.key === "Enter" && n && AC.act >= 0) { e.preventDefault(); acChoose(AC.opts[AC.act]); }
      else if (e.key === "Escape" && n) { e.preventDefault(); e.stopPropagation(); acClose(); }
      else if (e.key === "Tab") acClose();
    });
    ul.addEventListener("mousedown", function (e) { e.preventDefault(); });
    ul.addEventListener("click", function (e) { var li = e.target.closest("li"); if (li) acChoose(AC.opts[+li.id.slice(2)]); });
    inp.addEventListener("blur", function () { setTimeout(acClose, 100); });
    $("searchForm").addEventListener("submit", acClose, true);
  }
  function lev(a, b) {
    var m = a.length, n = b.length, d = [], i, j; for (i = 0; i <= m; i++) d[i] = [i]; for (j = 0; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  // "Did you mean" streets of that locality (from the offline index) for a street that is not there.
  function streetSuggest(p, sid) {
    var g = geoIdx(); if (!g || !p.loc) return;
    g.shard(p.loc.c).then(function (d) {
      if (sid !== searchId) return;
      var q = sskel(p.street.replace(/^שדרות\s+/, "")), seen = {}, hits = [];
      if (q.length < 2) return;
      d.streets.forEach(function (s) {
        var nm = s.names[0]; if (!nm || /^\d+$/.test(nm) || seen[nm]) return; seen[nm] = 1;
        var k = sskel(nm), sc = lev(k, q);
        plain(nm).split(" ").forEach(function (w) { var kw = sskel(w); if (kw.length >= 3 && q.length >= 3 && kw.slice(0, 3) === q.slice(0, 3)) sc = Math.min(sc, 1.5 + Math.abs(kw.length - q.length) / 4); if (kw && lev(kw, q) <= 1) sc = Math.min(sc, 1); });
        if (sc <= 2) hits.push([sc, nm]);
      });
      hits.sort(function (a, b) { return a[0] - b[0]; });
      hits = hits.slice(0, 4).map(function (h) { return h[1]; });
      if (!hits.length) return;
      var el = $("alts");
      el.innerHTML = '<span class="alts-q">רחובות דומים ב' + esc(p.loc.name) + ":</span>" + hits.map(function (nm) {
        var qq = nm + (p.num ? " " + p.num : "") + ", " + p.loc.name; return '<button type="button" data-q="' + esc(qq) + '">' + esc(nm) + "</button>";
      }).join("");
      Array.prototype.forEach.call(el.querySelectorAll("button"), function (b) { b.addEventListener("click", function () { $("q").value = b.getAttribute("data-q"); search(); }); });
    });
  }
  function search(fromUrl) {
    var q = $("q").value.trim();
    window.kalpiBusy = false;
    $("alts").innerHTML = "";
    if (!q) { status('<p class="hint-msg" role="status">הקלידו כתובת: רחוב, מספר ויישוב. למשל: הרצל 1, ראשון לציון</p>', true); $("q").focus(); return; }
    if (!D) { pending = true; status('<p class="hint-msg" role="status">טוענים את נתוני הקלפיות… החיפוש יתחיל מיד בסיום הטעינה.</p>', true); return; }
    if (fromUrl !== true) setUrl({ q: q }, true);
    $("clearQ").hidden = false;
    var id = ++searchId, n = normalize(q), p = parse(n);
    $("alts").innerHTML = "";
    var free = p.loc && p.city ? (p.street + (p.num ? " " + p.num : "") + ", " + p.city).replace(/^,\s*/, "") : n;
    // A bare settlement name: use that settlement's polling places from the data.
    if (!p.street && p.loc) return settlement(p.loc, "");
    var off = null;
    var steps = [function () { return cec(p.loc && p.city ? free.replace(/,/g, " ") : n, p); },
      function () { return nom("q=" + encodeURIComponent(free), p, "חיפוש חופשי"); }];
    if (p.city) steps.push(function () {
      return nom("street=" + encodeURIComponent((p.num ? p.num + " " : "") + p.street) + "&city=" + encodeURIComponent(p.city) + (p.loc ? "&viewbox=" + box(p.loc) + "&bounded=1" : ""), p, "חיפוש מובנה");
    });
    if (/^שדרות\s/.test(p.street)) {
      var s2 = p.street.replace(/^שדרות\s+/, "");
      steps.push(function () { return nom("q=" + encodeURIComponent(s2 + (p.num ? " " + p.num : "") + (p.city ? ", " + p.city : "")) + (p.loc ? "&viewbox=" + box(p.loc) + "&bounded=1" : ""), p, "בלי 'שדרות'"); });
    }
    steps.push(function () { return photon(free, p); });
    if (p.num && p.street && p.city) steps.push(function () { return govmap(p); });
    // Stepper (≤3 rows), shown only after 600 ms so a fast CEC hit does not flash it.
    var kinds = steps.map(function (f, j) { return j === 0 ? "cec" : j === steps.length - 1 && p.num && p.street && p.city ? "govmap" : "osm"; });
    var rowsK = kinds.filter(function (k, j) { return kinds.indexOf(k) === j; }), stt = {}, shown = false;
    var NAMES = { cec: "אתר ועדת הבחירות", osm: "OpenStreetMap", govmap: "GovMap" };
    rowsK.forEach(function (k) { stt[k] = "pend"; });
    function draw() {
      if (!shown || id !== searchId) return;
      $("status").innerHTML = '<div class="stepper"><p class="st-t">מחפשים את הכתובת…</p><ul>' + rowsK.map(function (k) {
        return '<li class="' + stt[k] + '"><span class="st-i" aria-hidden="true"></span><bdi>' + NAMES[k] + "</bdi>" + (stt[k] === "no" ? ": לא נמצאה התאמה" : "") + "</li>";
      }).join("") + '</ul><div class="skel" aria-hidden="true"><i></i><i></i></div><button type="button" class="linkish" id="cancelQ">ביטול</button></div>';
      $("cancelQ").onclick = function () { ++searchId; clearTimeout(tmr); status(""); };
    }
    var tmr = setTimeout(function () { shown = true; draw(); }, 600);
    function done() { clearTimeout(tmr); }
    var best = null, failed = 0, i = 0, bg = false;
    window.kalpiBusy = true;
    function idle() { if (id === searchId) window.kalpiBusy = false; }
    offline(n, p).then(function (o) {
      if (id !== searchId) return;
      off = o;
      // Offline first: a confident hit from the site's own index is shown at once, with no third-party call.
      // House numbers (and queries without one) are final; an interpolated or street-level point is refined
      // in the background and replaced only if an online geocoder finds the exact house in the same locality.
      if (o && o.prec && !o.vc && o.score >= 0.85 && (o.prec !== "area" || !p.num)) {
        done(); show(o);
        if (o.prec === "house" || !p.num) return idle();
        bg = true;
      }
      // Neither the offline index (OSM + the official street list) knows this street: ask only the CEC
      // (which mirrors the official addresses) and then say plainly that the street was not found.
      if (o && o.none && p.loc && !/[A-Za-z\u0600-\u06FF]/.test(p.street)) steps.length = 1;
      next();
    });
    function next() {
      if (id !== searchId) return;
      if (i >= steps.length) {
        done(); idle();
        if (bg) return;
        var down = failed === steps.length;
        var pick = best;
        if (off && off.prec && (!pick || RANKP[off.prec] > (RANKP[pick.prec] || 0))) pick = off;
        if (pick) { if (down && pick.off) pick.why = ("שירותי איתור הכתובות לא זמינים כרגע; התוצאה מהאינדקס של האתר. " + (pick.why || "")).trim(); return show(pick); }
        if (p.loc && p.street) return noStreet(down);
        if (p.loc) return settlement(p.loc, down ? "שירותי איתור הכתובות לא זמינים כרגע." : "", true);
        return localSearch(q, down);
      }
      if (i && kinds[i] !== kinds[i - 1] && stt[kinds[i - 1]] === "act") stt[kinds[i - 1]] = "no";
      stt[kinds[i]] = "act"; if (!bg) draw();
      steps[i++]().then(function (r) {
        if (id !== searchId) return;
        // Never show a point in another locality than the one typed (Photon's "הדר" in חוף הכרמל for חיפה).
        if (r && p.loc && (r.c ? r.c !== p.loc.c : !inLocBox(r, p.loc, 0.03))) r = null;
        if (bg) { if (r && r.prec === "house") { idle(); return show(r); } return next(); }
        if (r && (r.prec === "house" || !p.num)) {
          idle();
          // Without a number, a street/neighborhood from the offline index beats an online "area" (a POI or region).
          if (r.prec === "area" && off && off.prec && RANKP[off.prec] > RANKP.area && off.prec !== "estreet") return show(off);
          return show(r);
        }
        if (r && (!best || RANKP[r.prec] > RANKP[best.prec])) best = r;
        next();
      }, function () { failed++; next(); });
    }
    // Typed a street that no geocoder found. If the official street list of the locality (data.gov.il 321) and the
    // offline index both lack it, say so plainly and offer similar streets; otherwise it is a real street we could not place.
    function noStreet(down) {
      var sid = id;
      officialStreets(p.loc.c).then(function (set) {
        if (sid !== searchId) return;
        var st = sskel(p.street.replace(/^שדרות\s+/, "")), listed = !!(set && (set[st] || set[sskel(p.street)]));
        if (off && off.nameOnly) listed = true;
        if (!listed && (set || (off && off.none))) {
          settlement(p.loc, "לא נמצא רחוב בשם \u201D" + p.street + "\u201C ב" + p.loc.name + " לפי רשימת הרחובות הרשמית. מוצגות קלפיות סמוך למרכז היישוב. כדאי לבדוק את שם הרחוב ואת היישוב.");
          return streetSuggest(p, sid);
        }
        settlement(p.loc, (down ? "שירותי איתור הכתובות לא זמינים כרגע. " : "") + (listed ? "הרחוב " + ((off && off.nameOnly) || p.street) + " קיים ב" + p.loc.name + ", אבל מיקומו לא ידוע לנו. מוצגות קלפיות סמוך למרכז היישוב." : ""), !listed);
      });
    }
    function show(r) {
      if (id !== searchId) return;
      done();
      var c = r.c || null;
      // Scope to the typed locality only when the point is actually inside it (with ~3 km of slack).
      if (!c && p.loc && inLocBox(r, p.loc, 0.03)) c = p.loc.c;
      status("");
      locate(r.lat, r.lon, r.label, r.prec, { c: c, nb: r.nb, src: r.src, why: r.why || "" });
    }
  }
  // Settlement fallback. notFound: the street was typed but not found (yellow banner per brief §3.6).
  function settlement(l, why, notFound) {
    status("");
    var msg = (why ? why + " " : "") + (notFound ? "לא מצאנו את הרחוב. מוצגות קלפיות סמוך למרכז " + l.name + "." : "");
    locate(l.y, l.x, "מרכז " + l.name, "settlement", { c: l.c, why: msg.trim(), src: "נתוני הקלפיות" });
  }
  function noResult(q, down) {
    status(""); clearResult();
    $("results").innerHTML = '<div class="noresult" role="alert"><h2 class="sec">' + (down ? "שירותי איתור הכתובות לא זמינים כרגע." : "לא מצאנו את הכתובת \u201D" + esc(q) + "\u201C") + "</h2>" +
      (down ? "<p>אפשר ללחוץ על המפה במקום הכתובת.</p>" : "<p>מה אפשר לעשות:</p><ul><li>לבדוק את האיות ואת שם היישוב</li><li>לכתוב רק רחוב ויישוב</li><li>ללחוץ על המפה במקום הנכון</li></ul>") + "</div>";
    $("announce").textContent = down ? "שירותי איתור הכתובות לא זמינים כרגע." : "לא מצאנו את הכתובת " + q;
    if (!down) { var n = normalize(q); suggest(n, parse(n)); }
  }

  // Last resort: match the query against the polling-place addresses (locality first, then street)
  function norm(s) { return " " + s.replace(/["'״׳`\-–,.()]/g, " ").replace(/\s+/g, " ").trim() + " "; }
  function localSearch(q, down) {
    var why = down ? "שירותי איתור הכתובות לא זמינים כרגע." : "";
    var nq = norm(normalize(q)).replace(/ קריית /g, " קרית ");
    var locs = {};
    D.b.forEach(function (b) {
      var forms = [norm(b.t), norm(b.t.split(/\s*-\s*/)[0])];
      forms.forEach(function (t) { if (t.length > 4 && nq.indexOf(t) >= 0 && (locs[b.t] || 0) < t.length) locs[b.t] = t.length; });
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
    // With no locality in the query, a lone generic word (ואדי, דרך…) is not enough: every 3+ letter word must appear.
    if (!loc) best = best.filter(function (b) { var hay = norm(b.a + " " + b.v); return toks.every(function (t) { return t.length < 3 || hay.indexOf(t) >= 0; }); });
    if (bestScore >= 2 && best.length) {
      var qn = (q.match(/\d+/) || [])[0];
      if (qn) best.sort(function (a, b) {
        var an = +((a.a.match(/\d+/) || [1e9])[0]), bn = +((b.a.match(/\d+/) || [1e9])[0]);
        return Math.abs(an - qn) - Math.abs(bn - qn);
      });
      var b = best[0];
      status("");
      return locate(b.y, b.x, b.a + ", " + b.t, "local", { c: b.c, why: why, src: "כתובות הקלפיות" });
    }
    if (loc) return settlement(localities()[loc], why, true);
    noResult(q, down);
  }

  $("searchForm").addEventListener("submit", function (e) { e.preventDefault(); mq.matches && $("q").blur(); search(); });
  Array.prototype.forEach.call(document.querySelectorAll(".example"), function (b) {
    b.addEventListener("click", function () { $("q").value = b.getAttribute("data-q"); search(); });
  });
  $("q").addEventListener("input", function () { $("clearQ").hidden = !$("q").value; });
  acInit();
  $("clearQ").addEventListener("click", function () { $("q").value = ""; $("clearQ").hidden = true; ++searchId; status(""); clearResult(); renderEmpty(); setUrl({}, true); $("q").focus(); });
  function clearResult() {
    if (marker) { marker.remove(); marker = null; } if (layerNear) { layerNear.remove(); layerNear = null; }
    nearMarkers = []; lastNear = null; where = null; window.kalpiLast = null;
  }

  // ---------- URL as state: q | ll | kalpi, plus layer ----------
  var urlState = {};
  function layerParam() {
    if (mode === "off") return null; var src = mode.split(":")[0], m = mode.slice(src.length + 1);
    return m.slice(0, 2) === "p:" ? src + ":p:" + pname(P[+m.slice(2)][1]) : mode;
  }
  function setUrl(st, push) {
    if (st) urlState = st;
    var u = new URLSearchParams();
    Object.keys(urlState).forEach(function (k) { if (urlState[k] != null) u.set(k, urlState[k]); });
    var lp = layerParam(); if (lp) u.set("layer", lp);
    var qs = u.toString(), url = location.pathname + (qs ? "?" + qs : "");
    if (url === location.pathname + location.search) return;
    history[push ? "pushState" : "replaceState"](null, "", url);
  }
  function applyUrl(u) {
    var lay = u.get("layer");
    if (lay) {
      var lm = lay.match(/^(nb|sa):p:(.+)$/), val = lay;
      if (lm) { val = null; P.forEach(function (p, i) { if (pname(p[1]) === lm[2] || p[0] === lm[2]) val = lm[1] + ":p:" + i; }); }
      if (val && /^(nb|sa):(winner|turnout|ses|p:\d+)$/.test(val) && !(val === "nb:ses")) { mode = val; $("layer").value = val; setLayer(val, true); }
    } else if (mode !== "off") { $("layer").value = "off"; setLayer("off", true); }
    var kal = u.get("kalpi"), q = u.get("q"), ll = u.get("ll");
    if (kal) {
      var km = kal.match(/^(\d+)-(.+)$/), hit = null;
      if (km) D.b.forEach(function (b) { if (!hit && b.c === +km[1] && b.k.some(function (k) { return String(k[1]) === km[2]; })) hit = b; });
      if (hit) { urlState = { kalpi: kal }; pendingKalpi = km[2]; $("q").value = ""; return locate(hit.y, hit.x, "קלפי " + km[2] + " · " + hit.v + ", " + hit.t, "kalpi", { c: hit.c, kalpi: km[2], fromUrl: 1, src: "קישור לקלפי" }); }
    } else if (q) { urlState = { q: q }; $("q").value = q; $("clearQ").hidden = false; return search(true); }
    else if (ll) {
      var m = ll.split(",").map(Number);
      if (m.length === 2 && isFinite(m[0]) && isFinite(m[1])) { urlState = { ll: ll }; return locate(m[0], m[1], "נקודה במפה", "manual", { fromUrl: 1 }); }
    }
    if (kal || ll) toast("הקישור לא תקין, מוצג דף הבית");
    urlState = {}; clearResult(); renderEmpty();
  }
  window.addEventListener("popstate", function () { ++searchId; status(""); applyUrl(new URLSearchParams(location.search)); });

  // ---------- geolocation: opt-in with a one-line pre-prompt; locality from the containing stat area ----------
  var geoAsked = false;
  function geoMsg(t, isErr) { var n = $("geoNote"); n.hidden = !t; n.className = "geo-note" + (isErr ? " err" : ""); n.innerHTML = t || ""; }
  function inRing(x, y, r) { var c = false; for (var i = 0, j = r.length - 1; i < r.length; j = i++) { var xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
  function saAt(lat, lon) {
    return load("sa").then(function () {
      var hit = null;
      layers.sa.eachLayer(function (l) {
        if (hit || !l.getBounds().contains([lat, lon])) return;
        var g = l.feature.geometry, polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
        polys.forEach(function (pg) { if (!hit && inRing(lon, lat, pg[0]) && !pg.slice(1).some(function (h) { return inRing(lon, lat, h); })) hit = l.feature.properties.c; });
      });
      return hit;
    }, function () { return null; });
  }
  function doGeo() {
    var btn = $("loc"); btn.setAttribute("aria-busy", "true"); btn.classList.add("busy"); geoMsg("מאתרים את המיקום שלכם…");
    navigator.geolocation.getCurrentPosition(function (p) {
      var lat = p.coords.latitude, lon = p.coords.longitude;
      saAt(lat, lon).then(function (code) {
        btn.removeAttribute("aria-busy"); btn.classList.remove("busy"); geoMsg("");
        $("q").value = ""; $("clearQ").hidden = true;
        locate(lat, lon, "המיקום שלי", "geo", { c: code ? Math.floor(code / 10000) : null });
      });
    }, function (e) {
      btn.removeAttribute("aria-busy"); btn.classList.remove("busy");
      geoMsg(e.code === 1 ? "לא קיבלנו הרשאה למיקום. אפשר להקליד כתובת במקום." : e.code === 3 ? "איתור המיקום לקח יותר מדי זמן. נסו שוב או הקלידו כתובת." : "הדפדפן לא מצליח לאתר את המיקום כרגע.", true);
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
  }
  $("loc").onclick = function () {
    if (!navigator.geolocation) return geoMsg("הדפדפן הזה לא תומך באיתור מיקום.", true);
    if (geoAsked) return doGeo();
    geoMsg('המיקום משמש רק כדי למצוא קלפיות קרובות. הוא נשאר בדפדפן ולא נשמר. <button type="button" class="linkish" id="geoOk">אישור</button>');
    $("geoOk").onclick = function () { geoAsked = true; doGeo(); };
    $("geoOk").focus();
  };

  // ---------- keyboard: "/" focuses search, Esc clears / closes / lowers the sheet ----------
  document.addEventListener("keydown", function (e) {
    var t = e.target, typing = t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
    if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey) { e.preventDefault(); $("q").focus(); $("q").select(); }
    else if (e.key === "Escape") {
      if (t === $("q") && $("q").value) { $("q").value = ""; $("clearQ").hidden = true; return; }
      if (map._popup && map.hasLayer(map._popup)) { map.closePopup(); return; }
      if (mq.matches && sheet.state !== "peek") sheet.set(sheet.state === "full" ? "half" : "peek");
    }
  });
})();
