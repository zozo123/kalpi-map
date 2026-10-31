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
    setTimeout(layerSelect, 0);
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

  // ctx.c: CBS/CEC locality code of the geocoded address -> only that locality's polling places are candidates
  // (residents vote in their own locality). ctx.nb: CEC neighborhood id, known when the user searched a neighborhood.
  function locate(lat, lon, label, prec, ctx) {
    if (!D) return;
    ctx = ctx || {};
    if (ctx.nb && !N && !ctx.waited) { ctx.waited = 1; return extras().then(function () { locate(lat, lon, label, prec, ctx); }); }
    var all = D.b.map(function (b) { return { b: b, d: dist(lat, lon, b.y, b.x) }; }).sort(function (a, b) { return a.d - b.d; });
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
    lastCtx = { c: ctx.c, nb: ctx.nb && N ? N.h[ctx.nb] : null, scope: scope };
    if (marker) marker.remove();
    marker = L.marker([lat, lon], { title: label, draggable: true }).addTo(map).bindTooltip(label);
    marker.on("dragend", function () { var ll = marker.getLatLng(); status("נקודה שנבחרה במפה."); locate(ll.lat, ll.lng, "נקודה שנבחרה במפה", "manual", { c: ctx.c }); });
    if (layerNear) layerNear.remove();
    layerNear = L.layerGroup(near.map(function (n, i) {
      return L.marker([n.b.y, n.b.x], { icon: L.divIcon({ className: "", html: '<span class="card-num" style="display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;border-radius:50%;background:#1f5fbf;color:#fff;font-weight:700;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)">' + (i + 1) + "</span>", iconSize: [24, 24], iconAnchor: [12, 12] }) })
        .bindPopup(popupHtml(n.b));
    })).addTo(map);
    map.fitBounds(L.latLngBounds([[lat, lon]].concat(near.map(function (n) { return [n.b.y, n.b.x]; }))).pad(0.2));
    lastNear = near; lastLabel = label;
    render(near, label);
    extras().then(function () { if (lastNear === near) render(near, label); });
    // Exposed for automated tests (no network side effects)
    window.kalpiLast = { lat: lat, lon: lon, prec: prec || "manual", barzel: [].concat.apply([], near.map(function (n) { return n.b.k.map(function (k) { return k[0]; }); })), c: ctx.c || null, scope: scope };
  }

  function render(near, label) {
    var sc = lastCtx.scope === "nb" ? " (קודם כול בשכונה שחיפשתם, אחר כך ביישוב)" : lastCtx.scope === "loc" ? " ביישוב של הכתובת" : "";
    var h = '<div class="meta" style="margin-bottom:8px">5 מקומות הקלפי הקרובים' + sc + " אל: " + esc(label) + "</div>" + nbHtml(near) + saHtml(near);
    near.forEach(function (n, i) {
      var b = n.b, a = b.agg;
      h += '<article class="card"><h3><span class="num">' + (i + 1) + "</span>" + esc(b.v) + "</h3>" +
        '<div class="meta">' + esc(b.a) + ", " + esc(b.t) + " · " + fmtDist(n.d) + (n.out ? " · מחוץ ליישוב" : "") + (N && lastNb && nbOf(b) === lastNb ? " · באותה שכונה" : "") + " · " +
        (b.k.length === 1 ? "קלפי " + esc(b.k[0][1]) : b.k.length + " קלפיות (" + b.k.map(function (k) { return esc(k[1]); }).join(", ") + ")") + "</div>" +
        statsHtml(a) + (b.k.length > 1 ? '<div class="meta">סך הכול במקום:</div>' : "") + barsHtml(a) + histHtml(b.k, a);
      if (b.k.length > 1) {
        h += "<details><summary>תוצאות לכל קלפי בנפרד</summary>" + b.k.map(function (k) {
          var ka = aggregate([k]);
          return '<div class="kalpi"><div class="kh">קלפי ' + esc(k[1]) + (k[5] ? " · נגישה" : "") + "</div>" + statsHtml(ka) + barsHtml(ka) + (b.k.length > 1 ? histHtml([k], ka) : "") + "</div>";
        }).join("") + "</details>";
      }
      h += "</article>";
    });
    $("results").innerHTML = h;
  }

  // ---------- v2: history (K25/K24) and statistical areas, lazy-loaded ----------
  var H = null, S = null, N = null, extrasP = null, lastNear = null, lastLabel = "", lastCtx = {}, lastNb = null;
  function extras() {
    if (!extrasP) extrasP = Promise.all([
      fetch("data/hist.json").then(function (r) { return r.json(); }),
      fetch("data/sa.json").then(function (r) { return r.json(); }),
      fetch("data/nb.json").then(function (r) { return r.json(); })
    ]).then(function (a) { H = a[0]; S = a[1]; N = a[2]; }).catch(function () { extrasP = null; });
    return extrasP;
  }
  // ---- CEC neighborhoods (polygons = the kalpiot whose polling location lies inside; K26 recomputed from our data) ----
  function nbOf(b) { if (!N) return null; for (var i = 0; i < b.k.length; i++) { var u = N.k[b.k[i][0]]; if (u) return u; } return null; }
  function nbShares(r, col, plist) { // shares by party he name for one election column of a neighborhood row
    var valid = r[col], vec = r[col + 1], sh = {}; if (!valid) return null;
    for (var i = 0; i < vec.length; i += 2) { var nm = pname(plist ? plist[vec[i]][1] : P[vec[i]][1]); sh[nm] = (sh[nm] || 0) + vec[i + 1] / valid; }
    return sh;
  }
  function nbHtml(near) {
    lastNb = null;
    if (!N || !near.length) return "";
    var u = lastCtx.nb != null && N.n[lastCtx.nb] ? lastCtx.nb : null, how = "השכונה שחיפשתם";
    if (!u) { for (var i = 0; i < near.length && !u; i++) if (!near[i].out) u = nbOf(near[i].b); how = "לפי הקלפי הקרובה ביישוב"; }
    var r = u && N.n[u]; if (!r) return "";
    lastNb = +u;
    var now = nbShares(r, 3), s25 = nbShares(r, 5, N.p25), s24 = nbShares(r, 7, N.p24);
    var n25 = N.p25.reduce(function (o, p) { o[pname(p[1])] = 1; return o; }, {}), n24 = N.p24.reduce(function (o, p) { o[pname(p[1])] = 1; return o; }, {});
    var names = Object.keys(now || {}).filter(function (n) { return now[n] >= 0.02; }).sort(function (a, b) { return now[b] - now[a]; }).slice(0, 8);
    var code = {}; P.forEach(function (p) { code[pname(p[1])] = p[0]; });
    function cell(sh, nm, n) { if (!sh) return "<td>—</td>"; if (!nm[n]) return '<td class="na" title="לא התמודדה בשם זה">—</td>'; return "<td>" + pct(sh[n] || 0) + "</td>"; }
    var t = now ? '<table class="cmp"><thead><tr><th>רשימה</th><th>2026</th><th>2022</th><th>שינוי</th><th>2021</th></tr></thead><tbody>' + names.map(function (n) {
      var d = s25 && n25[n] ? ((now[n] - (s25[n] || 0)) * 100) : null;
      return '<tr><td><span class="sw" style="background:' + color(code[n]) + '"></span>' + esc(n) + "</td><td>" + pct(now[n]) + "</td>" + cell(s25, n25, n) +
        '<td class="d">' + (d === null ? "" : (d > 0 ? "+" : "") + d.toFixed(1)) + "</td>" + cell(s24, n24, n) + "</tr>";
    }).join("") + "</tbody></table>" : '<div class="meta">אין קלפי של 2026 בשכונה זו.</div>';
    return '<div class="card sa nb"><h3>השכונה: ' + esc(r[2]) + ", " + esc(r[1]) + '</h3><div class="meta">' + how + " · " + fmt(r[3]) + " קולות כשרים ב-2026 · שכונות ועדת הבחירות</div>" + t +
      '<div class="meta">אחוזים בלבד. 2022/2021 מקבצי השכונות של ועדת הבחירות לאותה שכונה; "—" = לא התמודדה באותו שם. השכונה נקבעת לפי מיקום הקלפיות, לא לפי מקום המגורים.</div></div>';
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
    if (!H) return '<div class="meta hist-wait">טוען השוואה לבחירות קודמות…</div>';
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
  function saHtml(near) {
    if (!S || !near.length) return "";
    var c = saCode(near[0].b), r = c && S.sa[c];
    if (!r) return "";
    var top = [];
    for (var i = 0; i < r[4].length && top.length < 3; i += 2) top.push(esc(pname(P[r[4][i]][1])) + " " + pct(r[4][i + 1] / r[3]));
    return '<div class="card sa"><h3>האזור הסטטיסטי (למ"ס)</h3><div class="meta">' + esc(saName(c)) + " · לפי הקלפי הקרובה</div>" +
      '<div class="stats"><span>אשכול חברתי-כלכלי: <b>' + (r[2] || "?") + "</b> מתוך 10" + (r[5] ? " (ברמת היישוב)" : "") + "</span>" +
      (r[3] ? "<span>מובילות באזור ב-2026: " + top.join(" · ") + "</span>" : "<span>אין קלפי באזור זה</span>") + "</div>" +
      '<div class="meta">1 = הנמוך ביותר, 10 = הגבוה ביותר (מדד הלמ"ס, 2021).</div></div>';
  }

  // Choropleth layers, loaded on first use. Mode: "off" | "<src>:winner" | "<src>:p:<partyIdx>" | "sa:ses"; src = nb (CEC neighborhoods) or sa (CBS statistical areas).
  var layers = {}, layerP = {}, mode = "off", cur = null;
  function sesColor(c) { var s = ["#b2182b", "#d6604d", "#f4a582", "#fddbc7", "#f7f7f7", "#d1e5f0", "#92c5de", "#4393c3", "#2166ac", "#053061"]; return c ? s[c - 1] : "#ccc"; }
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
    var src = mode.split(":")[0], m = mode.slice(src.length + 1), x = rowOf(src, f), st = { weight: 0.5, color: "#555", fillOpacity: 0.55, renderer: renderer };
    if (m === "ses") { st.fillColor = x ? sesColor(x[2][2]) : "#ccc"; return st; }
    if (!x || !x[0]) return Object.assign(st, { fillColor: "#bbb", fillOpacity: 0.15, dashArray: "2 3" });
    if (m === "winner") st.fillColor = color(P[x[1][0]][0]);
    else {
      var pi = +m.slice(2), v = 0;
      for (var i = 0; i < x[1].length; i += 2) if (x[1][i] === pi) v = x[1][i + 1];
      st.fillColor = color(P[pi][0]); st.fillOpacity = Math.min(0.9, 0.05 + v / x[0] * 1.6);
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
  function setLayer(m) {
    mode = m;
    if (cur) { cur.remove(); cur = null; }
    if (m === "off") return legend();
    var src = m.split(":")[0];
    status("טוען שכבה…");
    load(src).then(function () { if (mode !== m) return; cur = layers[src]; cur.setStyle(style); cur.addTo(map); cur.bringToBack(); status(""); legend(); },
      function () { layerP[src] = null; status("טעינת השכבה נכשלה."); });
  }
  function legend() {
    var el = $("legend"); if (mode === "off") { el.innerHTML = ""; return; }
    var src = mode.split(":")[0], m = mode.slice(src.length + 1), unit = src === "sa" ? 'אזור סטטיסטי (למ"ס)' : "שכונה (ועדת הבחירות)";
    var none = ' <span class="sw" style="background:#bbb;opacity:.4"></span>מקווקו = אין קלפי באזור זה.';
    if (m === "ses") el.innerHTML = "אשכול חברתי-כלכלי (1 נמוך, 10 גבוה): " + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (c) { return '<span class="sw" style="background:' + sesColor(c) + '"></span>' + c; }).join(" ");
    else if (m === "winner") el.innerHTML = "הרשימה הגדולה בכל " + unit + " (2026). לחצו לפרטים." + none;
    else el.innerHTML = "אחוז ההצבעה ל" + esc(pname(P[+m.slice(2)][1])) + " לפי " + unit + ": כהה יותר = יותר." + none;
  }
  function layerSelect() {
    var sel = $("layer"); if (!sel) return;
    function parties(src) { return P.slice(0, 14).map(function (p, i) { return '<option value="' + src + ":p:" + i + '">אחוז ל' + esc(pname(p[1])) + "</option>"; }).join(""); }
    sel.innerHTML = '<option value="off">ללא</option><optgroup label="שכונות (ועדת הבחירות)"><option value="nb:winner">הרשימה המובילה</option>' + parties("nb") +
      '</optgroup><optgroup label="אזורים סטטיסטיים (למ&quot;ס)"><option value="sa:winner">הרשימה המובילה</option><option value="sa:ses">אשכול חברתי-כלכלי</option>' + parties("sa") + "</optgroup>";
    sel.onchange = function () { setLayer(sel.value); };
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
      var L0 = LOC[b.t] || (LOC[b.t] = { name: b.t, c: b.c, n: 0, y: 0, x: 0, s: 90, w: 180, nn: -90, e: -180, k: 0 });
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
      return Object.keys(set).length ? set : null;
    }, function () { return null; });
    return streetsP[c];
  }
  function locByCode(c) { var L = localities(); for (var k in L) if (L[k].c === c) return L[k]; return null; }
  function cec(n, p) {
    var q = cecQ(n); if ((q.match(/\p{L}/gu) || []).length < 2) return Promise.resolve(null);
    return throttled("cec", "https://d3i80z2x83yp3b.cloudfront.net/search?q=" + encodeURIComponent(q)).then(function (res) {
      res = Array.isArray(res) ? res : [];
      var st = p.street ? sskel(p.street.replace(/^שדרות\s+/, "")) : "", locOk = function (r) { return p.loc ? r.c === p.loc.c : !p.city || cityOk([(r.n || "").split(", ").pop()], p); };
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
        } else if (r.t === 3 && !p.num && st && sskel(r.n.split(", ")[0]) === st) cands.push([2, r, "area"]);
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
      var c = r.c || (p.loc && p.loc.c) || null;
      status("נמצא: " + r.label + " · דיוק: " + PREC[r.prec] + " · מקור: " + r.src + (c ? " · קלפיות מתוך היישוב בלבד" : "") + ". אפשר לגרור את הסמן כדי לדייק.");
      locate(r.lat, r.lon, r.label, r.prec, { c: c, nb: r.nb });
    }
  }
  function settlement(l, why) {
    status(why + "מוצג מרכז היישוב " + l.name + " (" + l.k + " קלפיות ב-" + l.n + " מקומות). דיוק: " + PREC.settlement + ". לחצו על המפה או גררו את הסמן כדי לדייק.");
    locate(l.y, l.x, "מרכז " + l.name, "settlement", { c: l.c });
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
      return locate(b.y, b.x, b.a + ", " + b.t, "local", { c: b.c });
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
