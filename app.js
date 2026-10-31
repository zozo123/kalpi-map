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
  map.on("click", function (e) { locate(e.latlng.lat, e.latlng.lng, "נקודה שנבחרה במפה"); });

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
    var ver = "גרסת הנתונים: ספירה רשמית של ועדת הבחירות המרכזית, תמונת מצב מ-" + asOf + " (שעון ישראל), " +
      fmt(nk) + " קלפיות ב-" + fmt(d.b.length) + " מקומות. ייתכנו הבדלים קטנים מהפרסום הסופי הרשמי.";
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

  function locate(lat, lon, label) {
    if (!D) return;
    var near = D.b.map(function (b) { return { b: b, d: dist(lat, lon, b.y, b.x) }; })
      .sort(function (a, b) { return a.d - b.d; }).slice(0, NEAREST);
    if (marker) marker.remove();
    marker = L.marker([lat, lon], { title: label }).addTo(map).bindTooltip(label);
    if (layerNear) layerNear.remove();
    layerNear = L.layerGroup(near.map(function (n, i) {
      return L.marker([n.b.y, n.b.x], { icon: L.divIcon({ className: "", html: '<span class="card-num" style="display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;border-radius:50%;background:#1f5fbf;color:#fff;font-weight:700;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)">' + (i + 1) + "</span>", iconSize: [24, 24], iconAnchor: [12, 12] }) })
        .bindPopup(popupHtml(n.b));
    })).addTo(map);
    map.fitBounds(L.latLngBounds([[lat, lon]].concat(near.map(function (n) { return [n.b.y, n.b.x]; }))).pad(0.2));
    render(near, label);
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
  // Nominatim usage policy: at most 1 request per second, no autocomplete.
  var lastReq = 0, searchId = 0;
  function nominatim(q) {
    var wait = Math.max(0, 1100 - (Date.now() - lastReq));
    return new Promise(function (ok) { setTimeout(ok, wait); }).then(function () {
      lastReq = Date.now();
      var url = "https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=il&accept-language=he&limit=5&q=" + encodeURIComponent(q);
      return fetch(url, { headers: { "Accept": "application/json" } }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
    });
  }
  // Query variants, tried in order until one returns a result.
  function variants(q) {
    var noPrefix = q.replace(/(^|[\s,])(רחוב|רח['׳]?|שדרות|שד['׳]|שדרת|סמטת|דרך)\s+/g, "$1").replace(/\s+/g, " ").trim();
    var noNum = noPrefix.replace(/(^|[\s,])\d+[א-ת]?(?=[\s,]|$)/g, "$1").replace(/\s*,\s*,/g, ",").replace(/\s+/g, " ").replace(/^[\s,]+|[\s,]+$/g, "");
    var out = [q];
    if (noPrefix !== q) out.push(noPrefix);
    if (noNum && noNum !== noPrefix) out.push(noNum);
    return out;
  }
  function search() {
    var q = $("q").value.trim();
    $("alts").innerHTML = "";
    if (!q || !D) return;
    history.replaceState(null, "", "?q=" + encodeURIComponent(q));
    var id = ++searchId, vs = variants(q), i = 0;
    status("מחפש את הכתובת…");
    (function next() {
      if (id !== searchId) return;
      if (i >= vs.length) return localSearch(q, "הכתובת לא נמצאה ב-OpenStreetMap. ");
      var v = vs[i++];
      nominatim(v).then(function (res) {
        if (id !== searchId) return;
        if (!res.length) return next();
        var note = (i === vs.length && vs.length > 1 && /\d/.test(q)) ? " (מספר הבית לא נמצא, מוצג הרחוב)" : "";
        pick(res[0], note);
        if (res.length > 1) {
          $("alts").innerHTML = '<span class="meta">התכוונתם ל:</span>';
          res.slice(1).forEach(function (r) {
            var bt = document.createElement("button"); bt.textContent = shortName(r.display_name);
            bt.onclick = function () { pick(r, ""); }; $("alts").appendChild(bt);
          });
        }
      }).catch(function () { if (id === searchId) localSearch(q, "שירות איתור הכתובות לא זמין כרגע. "); });
    })();
  }
  function shortName(s) { return s.split(",").slice(0, 4).join(",").trim(); }
  function pick(r, note) {
    status("נמצא: " + r.display_name + (note || ""));
    locate(+r.lat, +r.lon, shortName(r.display_name));
  }

  // Fallback: match the query against the polling-place addresses (locality first, then street)
  var ALIASES = { "נצרת עילית": "נוף הגליל", "פתח תקוה": "פתח תקווה", "מודיעין מכבים רעות": "מודיעין-מכבים-רעות", "בנימינה": "בנימינה-גבעת עדה" };
  function norm(s) { return " " + s.replace(/["'״׳`\-–,.()]/g, " ").replace(/\s+/g, " ").trim() + " "; }
  function localSearch(q, why) {
    var nq = norm(q).replace(/ קריית /g, " קרית ").replace(/ ת א /g, " תל אביב ");
    Object.keys(ALIASES).forEach(function (k) { nq = nq.replace(norm(k), norm(ALIASES[k])); });
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
      status(why + "מציג לפי כתובת קלפי תואמת: " + b.a + ", " + b.t + (best.length > 1 ? " (נמצאו " + best.length + " התאמות, מוצגת הקרובה במספר הבית)" : ""));
      return locate(b.y, b.x, b.a + ", " + b.t);
    }
    if (loc) {
      var y = 0, x = 0; pool.forEach(function (b) { y += b.y; x += b.x; });
      status(why + "הרחוב לא נמצא; מוצג מרכז היישוב " + loc + ". לחצו על המפה כדי לדייק.");
      return locate(y / pool.length, x / pool.length, "מרכז " + loc);
    }
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
