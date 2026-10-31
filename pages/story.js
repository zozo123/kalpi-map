/* story.html: a scrollytelling national story computed in the browser from the repo's data files only.
   Inputs: data/kalpiot26.json (2026 per ballot box), data/nb.json + data/nb.topo.json (CEC neighborhoods with
   2026/2022/2021 results), data/sa.json (CBS statistical areas + SES cluster), data/build_stats.json (data version).
   No numbers are hard-coded: every figure in the text is derived below. Self-contained; does not touch app.js. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var R = 6378137, DPR = Math.min(window.devicePixelRatio || 1, 2);
  var REPO = "https://github.com/zozo123/kalpi-map/blob/main/";
  var YEARS = ["2021", "2022", "2026"];
  var OTHER = "#8c939b", NODATA = "#e4ded3";
  // Display colors for lists that did not run in 2026 under the same name (the repo's party data only colors 2026 lists).
  // These are presentation choices, not data; the legend marks them.
  var PAST_COLORS = { "יש עתיד": "#3d9bd6", "המחנה הממלכתי": "#d4a72c", "ימינה": "#9c6b3f", "תקווה חדשה": "#6e7f3a", "העבודה": "#e05a6b",
    "מרצ": "#3fae8f", 'חד"ש-תע"ל': "#3c9a5f", 'בל"ד': "#6b8e23", "הבית היהודי": "#8a6fbf" };
  var MOBILE = window.matchMedia("(max-width: 860px)"); // matches the story.css breakpoint; on mobile step cards cover the lower map
  var REGIONS = { // view boxes only (lon/lat), not data
    all: null, dan: [34.735, 31.955, 34.935, 32.185], jlm: [35.15, 31.72, 35.27, 31.85],
    north: [34.95, 32.45, 35.62, 33.1], south: [34.55, 30.95, 35.25, 31.45] };
  var REGION_NAMES = { all: "כל הארץ", dan: "גוש דן", jlm: "ירושלים", north: "חיפה והצפון", south: "באר שבע והנגב" };

  function pname(n) { return String(n).replace(/\s*\(לא התמודדה\)$/, ""); }
  function fmt(n) { return Math.round(n).toLocaleString("he-IL"); }
  function pct(x, d) { return (x * 100).toFixed(d == null ? 1 : d) + "%"; }
  function pp(d) { var v = d * 100; return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function hex(h) { h = h.replace("#", ""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function merc(lon, lat) { return [R * lon * Math.PI / 180, R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))]; }
  function get(u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(u + " " + r.status); return r.json(); }); }

  Promise.all(["data/kalpiot26.json", "data/nb.json", "data/nb.topo.json", "data/sa.json", "data/build_stats.json"].map(get))
    .then(function (a) { build(a[0], a[1], a[2], a[3], a[4]); })
    .catch(function (e) { $("kpis").innerHTML = '<div class="card err">טעינת הנתונים נכשלה: ' + esc(e.message) + "</div>"; });

  function build(K, N, T, S, BS) {
    // ---------------- data model ----------------
    var P = K.parties, COL = {}, RAN26 = {};
    P.forEach(function (p) { var n = pname(p[1]); if (!COL[n]) COL[n] = p[4]; if (n === p[1]) RAN26[n] = 1; });
    function color(n) { return COL[n] || PAST_COLORS[n] || OTHER; }
    var PL = { "2021": N.p24, "2022": N.p25, "2026": P }, NCOL = { "2021": 7, "2022": 5, "2026": 3 };
    var RAN = { "2026": RAN26 };
    ["2021", "2022"].forEach(function (y) { RAN[y] = {}; PL[y].forEach(function (p) { RAN[y][pname(p[1])] = 1; }); });

    // 2026 national + per town + per building, from every regular ballot box
    var nat = { el: 0, vo: 0, valid: 0, v: {} }, towns = {}, blds = [], nk = 0;
    var NB = {};
    Object.keys(N.n).forEach(function (u) {
      var r = N.n[u], o = { u: +u, code: r[0], town: r[1], name: r[2], el: 0, vo: 0, y: {} };
      YEARS.forEach(function (y) {
        var c = NCOL[y], valid = r[c], vec = r[c + 1] || [], sh = {}, win = null, best = -1;
        if (!valid) return;
        for (var i = 0; i < vec.length; i += 2) { var nm = pname(PL[y][vec[i]][1]); sh[nm] = (sh[nm] || 0) + vec[i + 1] / valid; }
        Object.keys(sh).forEach(function (n) { if (sh[n] > best) { best = sh[n]; win = n; } });
        o.y[y] = { valid: valid, sh: sh, win: win };
      });
      NB[u] = o;
    });
    var ses = {};
    K.b.forEach(function (b) {
      var m = merc(b.x, b.y), bv = {}, bvalid = 0, bel = 0, bvo = 0;
      var t = towns[b.c] || (towns[b.c] = { name: b.t, el: 0, vo: 0, valid: 0, v: {} });
      b.k.forEach(function (k) {
        nk++; bel += k[2]; bvo += k[3];
        var vec = k[6];
        for (var i = 0; i < vec.length; i += 2) { var n = pname(P[vec[i]][1]), v = vec[i + 1]; bv[n] = (bv[n] || 0) + v; bvalid += v; nat.v[n] = (nat.v[n] || 0) + v; t.v[n] = (t.v[n] || 0) + v; }
        var u = N.k[k[0]]; if (u != null && NB[u]) { NB[u].el += k[2]; NB[u].vo += k[3]; }
        var sc = S.k[k[0]], sr = sc && S.sa[sc], cl = sr ? sr[2] || 0 : 0;
        var s = ses[cl] || (ses[cl] = { el: 0, vo: 0, n: 0 }); s.el += k[2]; s.vo += k[3]; s.n++;
      });
      nat.el += bel; nat.vo += bvo; nat.valid += bvalid; t.el += bel; t.vo += bvo; t.valid += bvalid;
      var win = null, best = -1; Object.keys(bv).forEach(function (n) { if (bv[n] > best) { best = bv[n]; win = n; } });
      blds.push({ x: m[0] - T.transform.translate[0], y: m[1] - T.transform.translate[1], valid: bvalid, win: win, share: bvalid ? best / bvalid : 0, t: b.t, a: b.a, v: b.v, n: b.k.length, to: bel ? bvo / bel : 0 });
    });
    blds.sort(function (a, b) { return b.valid - a.valid; }); // draw big first, small on top
    var natRank = Object.keys(nat.v).sort(function (a, b) { return nat.v[b] - nat.v[a]; });

    // per-year sums over CEC neighborhoods (same unit for all three years) and winner counts
    var nbList = Object.keys(NB).map(function (u) { return NB[u]; });
    var ysum = {}, wins = {};
    YEARS.forEach(function (y) {
      var s = { valid: 0, v: {} }, w = {}, c = NCOL[y];
      nbList.forEach(function (o) {
        var r = N.n[o.u], vec = r[c + 1] || [];
        if (!r[c]) return; s.valid += r[c];
        for (var i = 0; i < vec.length; i += 2) { var n = pname(PL[y][vec[i]][1]); s.v[n] = (s.v[n] || 0) + vec[i + 1]; }
        w[o.y[y].win] = (w[o.y[y].win] || 0) + 1;
      });
      ysum[y] = s; wins[y] = w;
    });
    function nbWith(y) { return nbList.filter(function (o) { return o.y[y]; }).length; }
    function rankWins(y) { return Object.keys(wins[y]).sort(function (a, b) { return wins[y][b] - wins[y][a]; }); }
    var cont = natRank.filter(function (n) { return RAN["2022"][n] && nat.v[n] / nat.valid >= 0.01; }); // same name in 2022 and 2026
    var MINV = 1000;
    function swings(n) {
      return nbList.filter(function (o) { return o.y["2022"] && o.y["2026"] && o.y["2022"].valid >= MINV && o.y["2026"].valid >= MINV; })
        .map(function (o) { var a = o.y["2022"].sh[n] || 0, b = o.y["2026"].sh[n] || 0; return { o: o, a: a, b: b, d: b - a }; })
        .sort(function (x, z) { return z.d - x.d; });
    }
    var flips = nbList.filter(function (o) { return o.y["2022"] && o.y["2026"]; }), flipN = flips.filter(function (o) { return o.y["2022"].win !== o.y["2026"].win; }).length;

    // ---------------- map ----------------
    var cv = $("map"), ctx = cv.getContext("2d"), W = 0, H = 0;
    var sx = T.transform.scale[0], sy = T.transform.scale[1];
    var arcs = T.arcs.map(function (a) { var x = 0, y = 0; return a.map(function (d) { x += d[0]; y += d[1]; return [x * sx, y * sy]; }); });
    function ring(ix) { var pts = []; ix.forEach(function (i) { var a = i >= 0 ? arcs[i] : arcs[~i].slice().reverse(); pts = pts.concat(pts.length ? a.slice(1) : a); }); return pts; }
    var feats = [];
    T.objects[Object.keys(T.objects)[0]].geometries.forEach(function (g) {
      if (g.type !== "Polygon" && g.type !== "MultiPolygon") return;
      var polys = g.type === "Polygon" ? [g.arcs] : g.arcs, p = new Path2D(), bb = [Infinity, Infinity, -Infinity, -Infinity];
      polys.forEach(function (poly) { poly.forEach(function (r) { ring(r).forEach(function (pt, i) {
        if (i) p.lineTo(pt[0], pt[1]); else p.moveTo(pt[0], pt[1]);
        if (pt[0] < bb[0]) bb[0] = pt[0]; if (pt[1] < bb[1]) bb[1] = pt[1]; if (pt[0] > bb[2]) bb[2] = pt[0]; if (pt[1] > bb[3]) bb[3] = pt[1];
      }); p.closePath(); }); });
      feats.push({ path: p, bb: bb, nb: NB[g.properties.u] || null, cur: hex(NODATA).concat(1), from: null, to: null });
    });
    var full = [0, 0, T.bbox[2] - T.bbox[0], T.bbox[3] - T.bbox[1]];
    function regionBox(k) { var b = REGIONS[k]; if (!b) return full; var a = merc(b[0], b[1]), c = merc(b[2], b[3]), t = T.transform.translate; return [a[0] - t[0], a[1] - t[1], c[0] - t[0], c[1] - t[1]]; }

    var st = { mode: "winner", year: 2, party: natRank[0], region: "all" }, view = full.slice(), viewFrom = null, viewTo = full, dotA = 0, dotFrom = 0, dotTo = 0, anim = null;
    var TURN = ["#f4efe4", "#cfe3e0", "#8ec3c0", "#4a9aa0", "#1d6f7e", "#0b4357"], TMIN = 0.4, TMAX = 0.9;
    function ramp(stops, t) { t = Math.max(0, Math.min(1, t)) * (stops.length - 1); var i = Math.min(stops.length - 2, Math.floor(t)), f = t - i, a = hex(stops[i]), b = hex(stops[i + 1]); return [0, 1, 2].map(function (j) { return a[j] + (b[j] - a[j]) * f; }); }
    function target(f) {
      var o = f.nb, y = YEARS[st.year], m = st.mode;
      if (m === "dots") return hex("#ffffff").concat(0.55);
      if (!o) return hex(NODATA).concat(0.7);
      if (m === "turnout") return o.el ? ramp(TURN, (o.vo / o.el - TMIN) / (TMAX - TMIN)).concat(0.95) : hex(NODATA).concat(0.7);
      if (m === "swing") {
        var a = o.y["2022"], b = o.y["2026"];
        if (!a || !b || !RAN["2022"][st.party]) return hex(NODATA).concat(0.7);
        var d = (b.sh[st.party] || 0) - (a.sh[st.party] || 0), k = Math.min(1, Math.abs(d) / 0.2);
        return (d >= 0 ? hex(color(st.party)) : hex("#4b5563")).concat(0.08 + 0.87 * Math.sqrt(k));
      }
      var r = o.y[y]; if (!r) return hex(NODATA).concat(0.7);
      if (m === "share") { if (!RAN[y][st.party]) return hex(NODATA).concat(0.5); return hex(color(st.party)).concat(0.05 + 0.92 * Math.min(1, (r.sh[st.party] || 0) / 0.6)); }
      return hex(color(r.win)).concat(0.55 + 0.4 * Math.min(1, (r.sh[r.win] - 0.2) / 0.4));
    }
    function resize() {
      var r = cv.getBoundingClientRect(); W = Math.round(r.width * DPR); H = Math.round(r.height * DPR);
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      draw();
    }
    function fit(v) { // returns [scale, ox, oy] mapping local meters to device pixels; y flipped
      // two layouts: map above the controls, or map beside them (controls sit bottom-left); pick the larger scale
      var vw = v[2] - v[0], vh = v[3] - v[1], top = 56 * DPR, side = 16 * DPR, cr = ctrlRect();
      var b1 = MOBILE.matches ? Math.max(H * 0.42, (cr.h + 24) * DPR) : Math.min(H * 0.42, (cr.h + 24) * DPR), aw1 = W - 2 * side, ah1 = Math.max(60, H - top - b1);
      var s1 = Math.min(aw1 / vw, ah1 / vh);
      // free horizontal strip beside the controls (they may sit on either side in RTL)
      var x0 = cr.fl >= cr.fr ? side : (W / DPR - cr.fr + 16) * DPR, aw2 = Math.max(60, Math.max(cr.fl, cr.fr) * DPR - 16 * DPR - side), ah2 = Math.max(60, H - top - side);
      var s2 = cr.h ? Math.min(aw2 / vw, ah2 / vh) : 0;
      if (s2 > s1) return [s2, x0 + (aw2 - vw * s2) / 2 - v[0] * s2, top + (ah2 - vh * s2) / 2 + v[3] * s2];
      return [s1, side + (aw1 - vw * s1) / 2 - v[0] * s1, top + (ah1 - vh * s1) / 2 + v[3] * s1];
    }
    function ctrlRect() { var c = $("controls"); if (!c) return { fl: 0, fr: 0, h: 0 }; var r = c.getBoundingClientRect(), k = cv.getBoundingClientRect(); return { fl: Math.max(0, r.left - k.left), fr: Math.max(0, k.right - r.right), h: r.height }; }
    var fitNow = null;
    function draw() {
      if (!W || !H) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
      var f = fitNow = fit(view), s = f[0];
      ctx.setTransform(s, 0, 0, -s, f[1], f[2]);
      ctx.lineJoin = "round";
      var zr = s / fit(full)[0], lw = Math.max(0.12, Math.min(1.2, 0.15 + (zr - 1) * 0.1)) * DPR / s;
      for (var i = 0; i < feats.length; i++) {
        var F = feats[i], c = F.cur;
        ctx.fillStyle = "rgba(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + "," + c[3].toFixed(3) + ")";
        ctx.fill(F.path, "evenodd");
      }
      ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = lw;
      for (i = 0; i < feats.length; i++) ctx.stroke(feats[i].path);
      if (dotA > 0.01) {
        var zf = Math.sqrt(s / fit(full)[0]);
        ctx.globalAlpha = dotA; ctx.lineWidth = 0.6 * DPR / s; ctx.strokeStyle = "rgba(255,255,255,.9)";
        for (i = 0; i < blds.length; i++) {
          var b = blds[i], rad = Math.max(0.9, Math.sqrt(b.valid) * 0.055 * zf) * DPR / s;
          ctx.beginPath(); ctx.arc(b.x, b.y, rad, 0, 6.2832); ctx.fillStyle = color(b.win); ctx.fill(); if (zf > 1.6) ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function apply(dur) {
      feats.forEach(function (F) { F.from = F.cur.slice(); F.to = target(F); });
      viewFrom = view.slice(); viewTo = regionBox(st.region); dotFrom = dotA; dotTo = st.mode === "dots" ? 1 : 0;
      if (anim) cancelAnimationFrame(anim);
      var t0 = performance.now(), D = reduce ? 0 : (dur == null ? 750 : dur);
      (function tick(now) {
        var t = D ? Math.min(1, (now - t0) / D) : 1, e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        feats.forEach(function (F) { for (var j = 0; j < 4; j++) F.cur[j] = F.from[j] + (F.to[j] - F.from[j]) * e; });
        for (var j = 0; j < 4; j++) view[j] = viewFrom[j] + (viewTo[j] - viewFrom[j]) * e;
        dotA = dotFrom + (dotTo - dotFrom) * e;
        draw();
        anim = t < 1 ? requestAnimationFrame(tick) : null;
      })(t0);
      syncControls();
    }
    function set(p, dur) { Object.keys(p).forEach(function (k) { st[k] = p[k]; }); apply(dur); }

    // ---------------- controls, legend, tooltip ----------------
    var partySel = $("party");
    partySel.innerHTML = natRank.filter(function (n) { return nat.v[n] / nat.valid >= 0.01; }).map(function (n) { return '<option value="' + esc(n) + '">' + esc(n) + "</option>"; }).join("");
    Array.prototype.forEach.call(document.querySelectorAll("[data-mode]"), function (b) { b.onclick = function () { stopPlay(); set({ mode: b.getAttribute("data-mode") }); }; });
    $("year").oninput = function () { stopPlay(); set({ year: +this.value }); };
    partySel.onchange = function () { set({ party: this.value }); };
    $("region").onchange = function () { set({ region: this.value }); };
    var playT = null;
    function stopPlay() { if (playT) { clearInterval(playT); playT = null; $("play").textContent = "▶"; } }
    $("play").onclick = function () {
      if (playT) return stopPlay();
      if (st.mode !== "winner" && st.mode !== "share") st.mode = "winner";
      set({ year: 0 }); $("play").textContent = "❚❚";
      playT = setInterval(function () { if (st.year >= 2) return stopPlay(); set({ year: st.year + 1 }); }, 1500);
    };
    function syncControls() {
      Array.prototype.forEach.call(document.querySelectorAll("[data-mode]"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-mode") === st.mode); });
      $("year").value = st.year; partySel.value = st.party; $("region").value = st.region;
      var yearly = st.mode === "winner" || st.mode === "share";
      $("yearrow").style.display = yearly ? "" : "none";
      $("partyrow").style.display = st.mode === "share" || st.mode === "swing" ? "" : "none";
      var y = YEARS[st.year], t = { winner: "הרשימה המובילה בכל שכונה · " + y, share: "אחוז ל" + st.party + " · " + y, swing: "שינוי באחוז ל" + st.party + " · 2022→2026",
        turnout: "אחוז ההצבעה בכל שכונה · 2026", dots: "הרשימה המובילה בכל מבנה קלפי · 2026" }[st.mode];
      $("maptitle").textContent = t + (st.region !== "all" ? " · " + REGION_NAMES[st.region] : "");
      legend(); setTimeout(draw, 0);
    }
    function legend() {
      var el = $("legend"), y = YEARS[st.year], h = "";
      if (st.mode === "winner" || st.mode === "dots") {
        var yy = st.mode === "dots" ? "2026" : y, rk = st.mode === "dots" ? Object.keys(blds.reduce(function (o, b) { o[b.win] = (o[b.win] || 0) + 1; return o; }, {})) : rankWins(yy);
        if (st.mode === "dots") rk.sort(function (a, b) { return nat.v[b] - nat.v[a]; });
        h = rk.slice(0, 9).map(function (n) { return '<span class="it"><span class="sw" style="background:' + color(n) + '"></span>' + esc(n) + (COL[n] ? "" : "*") + "</span>"; }).join("");
        h += st.mode === "dots" ? '<div class="muted">עיגול לכל מבנה קלפי, גודל לפי מספר הקולות הכשרים.</div>' : '<div class="muted">חזק יותר = הובלה גדולה יותר.' + (rk.some(function (n) { return !COL[n]; }) ? " * צבע תצוגה לרשימה שלא התמודדה ב-2026 בשם זה." : "") + "</div>";
      } else if (st.mode === "share") {
        h = RAN[y][st.party] ? '<div class="ramp" style="background:linear-gradient(90deg,rgba(' + hex(color(st.party)) + ',.05),rgba(' + hex(color(st.party)) + ',.97))"></div><div class="rl"><span>0%</span><span>30%</span><span>≥60%</span></div>'
          : '<div class="muted">לא התמודדה בשם זה ב-' + y + ".</div>";
      } else if (st.mode === "swing") {
        h = RAN["2022"][st.party] ? '<div class="ramp" style="background:linear-gradient(90deg,rgba(75,85,99,.95),rgba(75,85,99,.08),rgba(' + hex(color(st.party)) + ',.08),rgba(' + hex(color(st.party)) + ',.95))"></div><div class="rl"><span>−20 נק׳</span><span>0</span><span>+20 נק׳</span></div><div class="muted">נקודות אחוז, רק בהשוואה לרשימה באותו שם ב-2022.</div>'
          : '<div class="muted">"' + esc(st.party) + '" לא התמודדה בשם זה ב-2022, ולכן אין השוואה.</div>';
      } else if (st.mode === "turnout") {
        h = '<div class="ramp" style="background:linear-gradient(90deg,' + TURN.join(",") + ')"></div><div class="rl"><span>≤' + pct(TMIN, 0) + "</span><span>" + pct((TMIN + TMAX) / 2, 0) + "</span><span>≥" + pct(TMAX, 0) + '</span></div><div class="muted">מצביעים בקלפיות הרגילות חלקי בעלי זכות. ללא מעטפות כפולות.</div>';
      }
      el.innerHTML = h;
    }
    var tip = $("tip"), hoverRaf = 0;
    function hit(ev) {
      var r = cv.getBoundingClientRect(), px = (ev.clientX - r.left) * DPR, py = (ev.clientY - r.top) * DPR, f = fitNow; if (!f) return null;
      var lx = (px - f[1]) / f[0], ly = (f[2] - py) / f[0];
      ctx.setTransform(f[0], 0, 0, -f[0], f[1], f[2]);
      for (var i = feats.length - 1; i >= 0; i--) { var b = feats[i].bb; if (lx < b[0] || lx > b[2] || ly < b[1] || ly > b[3]) continue; if (ctx.isPointInPath(feats[i].path, px, py, "evenodd")) return feats[i]; }
      return null;
    }
    function showTip(ev) {
      var F = hit(ev), o = F && F.nb;
      if (!o) { tip.hidden = true; return; }
      var rows = YEARS.map(function (y) { var r = o.y[y]; return '<div class="r"><span>' + y + "</span><span>" + (r ? '<span class="sw" style="background:' + color(r.win) + '"></span>' + esc(r.win) + " " + pct(r.sh[r.win]) : "—") + "</span></div>"; }).join("");
      var extra = "";
      if (st.mode === "share" || st.mode === "swing") extra = '<div class="r"><span>' + esc(st.party) + "</span><span>" + YEARS.map(function (y) { var r = o.y[y]; return r && RAN[y][st.party] ? pct(r.sh[st.party] || 0) : "—"; }).join(" · ") + "</span></div>";
      if (o.el) extra += '<div class="r"><span>אחוז הצבעה 2026</span><span>' + pct(o.vo / o.el) + "</span></div>";
      tip.innerHTML = "<b>" + esc(o.name) + "</b>, " + esc(o.town) + rows + extra;
      tip.hidden = false;
      var box = $("mapbox").getBoundingClientRect(), x = ev.clientX - box.left, y = ev.clientY - box.top, tw = tip.offsetWidth, th = tip.offsetHeight;
      tip.style.left = Math.max(6, Math.min(box.width - tw - 6, x - tw / 2)) + "px"; tip.style.top = Math.max(6, y - th - 14 < 0 ? y + 16 : y - th - 14) + "px";
    }
    cv.addEventListener("pointermove", function (ev) { if (ev.pointerType === "touch") return; cancelAnimationFrame(hoverRaf); hoverRaf = requestAnimationFrame(function () { showTip(ev); }); });
    cv.addEventListener("pointerleave", function () { tip.hidden = true; });
    cv.addEventListener("click", showTip);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(cv); else window.addEventListener("resize", resize);

    // ---------------- text: hero ----------------
    var asOf = K.source_as_of ? new Date(K.source_as_of) : null;
    var asOfTxt = asOf ? asOf.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "long", timeStyle: "short" }) + " (שעון ישראל)" : "";
    var nbN = nbWith("2026");
    $("kpis").innerHTML = [[fmt(nk), "קלפיות רגילות"], [fmt(K.b.length), "מבני קלפי"], [fmt(nbN), "שכונות עם תוצאות 2026"], [fmt(nat.el), "בעלי זכות בחירה"], [pct(nat.vo / nat.el), "אחוז הצבעה בקלפיות הרגילות"]]
      .map(function (k) { return '<div class="card kpi"><div class="v">' + k[0] + '</div><div class="l">' + k[1] + "</div></div>"; }).join("");
    function bars(v, total, list, max) {
      max = max || v[list[0]] / total;
      return '<div class="bars">' + list.map(function (n) { var s = v[n] / total; return '<div class="bar"><span class="nm" title="' + esc(n) + '"><span class="sw" style="background:' + color(n) + '"></span>' + esc(n) + '</span><span class="tr"><span class="fi" style="display:block;width:' + (s / max * 100).toFixed(1) + "%;background:" + color(n) + '"></span></span><span class="pv">' + pct(s) + "</span></div>"; }).join("") + "</div>";
    }
    var natTop = natRank.filter(function (n) { return nat.v[n] / nat.valid >= 0.01; });
    $("natbars").innerHTML = "<h3>התוצאה הארצית, קלפיות רגילות</h3>" + bars(nat.v, nat.valid, natTop) +
      '<p class="small muted">' + fmt(nat.valid) + " קולות כשרים ב-" + fmt(nk) + " קלפיות. רשימות מעל 1%. בלי " + fmt(BS["result_rows_without_location (double envelopes etc.)"]) + " שורות המעטפות הכפולות, ולכן האחוזים שונים מעט מהתוצאה הרשמית. מקור: <a href=\"" + REPO + 'data/kalpiot26.json">data/kalpiot26.json</a>' + (asOfTxt ? ", תמונת מצב של ועדת הבחירות מ-" + esc(asOfTxt) : "") + ".</p>";

    // ---------------- text: steps ----------------
    function townTop(code, n) { var t = towns[code]; if (!t) return ""; var r = Object.keys(t.v).sort(function (a, b) { return t.v[b] - t.v[a]; }).slice(0, n || 3); return "<b>" + esc(t.name) + "</b>" + bars(t.v, t.valid, r); }
    function winLine(y, n) { var rk = rankWins(y), tot = nbWith(y); return rk.slice(0, n || 4).map(function (w) { return '<span class="sw" style="background:' + color(w) + '"></span>' + esc(w) + ": " + fmt(wins[y][w]) + " (" + pct(wins[y][w] / tot, 0) + ")"; }).join("<br>"); }
    function topWinner(y) { return rankWins(y)[0]; }
    var srcNb = 'מקור: <a href="' + REPO + 'data/nb.json">data/nb.json</a> (שכונות ועדת הבחירות; 2026 מחושב מהקלפיות, 2022/2021 מקבצי השכונות של הוועדה).';
    var srcK = 'מקור: <a href="' + REPO + 'data/kalpiot26.json">data/kalpiot26.json</a>.';
    var w26 = topWinner("2026"), sw1 = swings(st.party), dotsWin = blds.reduce(function (o, b) { o[b.win] = (o[b.win] || 0) + 1; return o; }, {});
    var dotsRank = Object.keys(dotsWin).sort(function (a, b) { return dotsWin[b] - dotsWin[a]; });
    var sesKeys = Object.keys(ses).filter(function (k) { return +k > 0; }).sort(function (a, b) { return a - b; });
    var sesLo = ses[sesKeys[0]], sesHi = ses[sesKeys[sesKeys.length - 1]];
    var bigTowns = Object.keys(towns).map(function (c) { return towns[c]; }).filter(function (t) { return t.el >= 10000; }).sort(function (a, b) { return b.vo / b.el - a.vo / a.el; });
    var nbT = nbList.filter(function (o) { return o.el >= 2000; }).sort(function (a, b) { return b.vo / b.el - a.vo / a.el; });
    var STEPS = [
      { s: { mode: "winner", year: 2, region: "all" }, h: "מי הובילה איפה",
        b: "<p>כל צורה במפה היא שכונה או יישוב בחלוקה של ועדת הבחירות, והצבע הוא הרשימה שקיבלה בה הכי הרבה קולות כשרים ב-2026. " + esc(w26) + " הובילה במספר השכונות הגדול ביותר:</p><p>" + winLine("2026") + "</p><p class=\"muted small\">מתוך " + fmt(nbN) + " שכונות עם תוצאות. שכונה גדולה במפה אינה בהכרח שכונה עם הרבה מצביעים.</p><div class=\"src\">" + srcNb + "</div>" },
      { s: { mode: "winner", year: 2, region: "dan" }, h: "גוש דן מקרוב",
        b: "<p>בתוך המטרופולין ההבדלים חדים גם בין ערים שכנות.</p>" + townTop(5000) + townTop(6100) + "<div class=\"src\">" + srcK + "</div>" },
      { s: { mode: "winner", year: 2, region: "jlm" }, h: "ירושלים",
        b: townTop(3000, 4) + "<p class=\"small muted\">השכונות במזרח העיר כמעט ריקות במפה: יש בהן מעט קלפיות ומעט מצביעים.</p><div class=\"src\">" + srcK + "</div>" },
      { s: { mode: "winner", year: 2, region: "north" }, h: "חיפה והצפון",
        b: townTop(4000) + townTop(7300) + "<div class=\"src\">" + srcK + "</div>" },
      { s: { mode: "winner", year: 2, region: "south" }, h: "באר שבע והנגב",
        b: townTop(9000) + townTop(1161) + "<div class=\"src\">" + srcK + "</div>" },
      { s: { mode: "dots", year: 2, region: "all" }, h: "מבנה אחרי מבנה",
        b: "<p>אותה מפה, אבל לפי " + fmt(K.b.length) + " מבני הקלפי: עיגול לכל מבנה, בגודל מספר הקולות. כך רואים איפה נמצאים המצביעים, ולא רק כמה שטח יש לשכונה.</p><p>" + dotsRank.slice(0, 4).map(function (n) { return '<span class="sw" style="background:' + color(n) + '"></span>' + esc(n) + " הובילה ב-" + fmt(dotsWin[n]) + " מבנים"; }).join("<br>") + "</p><div class=\"src\">" + srcK + "</div>" },
      { s: { mode: "winner", year: 0, region: "all" }, h: "אחורה: 2021",
        b: "<p>אותן שכונות בבחירות לכנסת ה-24 (מרץ 2021). הרשימות המובילות בשכונות:</p><p>" + winLine("2021") + "</p><p class=\"small muted\">גללו הלאה, או השתמשו בכפתור ▶ במפה כדי לראות את המעבר.</p><div class=\"src\">" + srcNb + "</div>" },
      { s: { mode: "winner", year: 1, region: "all" }, h: "2022: הבחירות הקודמות",
        b: "<p>בבחירות לכנסת ה-25 (נובמבר 2022):</p><p>" + winLine("2022") + "</p><div class=\"src\">" + srcNb + "</div>" },
      { s: { mode: "winner", year: 2, region: "all" }, h: "2026: מה התהפך מאז 2022",
        b: "<p>ב-2026:</p><p>" + winLine("2026") + "</p><p>הרשימה המובילה השתנתה בין 2022 ל-2026 ב-" + fmt(flipN) + " מתוך " + fmt(flips.length) + " שכונות שיש להן תוצאות בשתי המערכות (" + pct(flipN / flips.length, 0) + "). חלק מהשינוי נובע מכך שרשימות התאחדו, התפצלו או לא התמודדו.</p><div class=\"src\">" + srcNb + "</div>" },
      { s: { mode: "share", year: 2, party: natRank[0], region: "all" }, h: "אחוז ל" + esc(natRank[0]),
        b: "<p>במקום רק מי ניצחה: כמה קיבלה " + esc(natRank[0]) + " בכל שכונה. בסכום השכונות: " + YEARS.map(function (y) { return y + " " + (RAN[y][natRank[0]] ? pct((ysum[y].v[natRank[0]] || 0) / ysum[y].valid) : "—"); }).join(" · ") + ".</p><p class=\"small muted\">אפשר להחליף רשימה ושנה בתפריט שבמפה.</p><div class=\"src\">" + srcNb + "</div>" },
      { s: { mode: "swing", party: natRank[0], region: "all" }, h: "איפה " + esc(natRank[0]) + " עלתה וירדה",
        b: (RAN["2022"][natRank[0]] ? "<p>השינוי בנקודות אחוז בין 2022 ל-2026, בשכונות עם לפחות " + fmt(MINV) + " קולות כשרים בשתי המערכות. העלייה הגדולה: <b>" + esc(sw1[0].o.name) + ", " + esc(sw1[0].o.town) + "</b> (" + pp(sw1[0].d) + "). הירידה הגדולה: <b>" + esc(sw1[sw1.length - 1].o.name) + ", " + esc(sw1[sw1.length - 1].o.town) + "</b> (" + pp(sw1[sw1.length - 1].d) + ").</p><p class=\"small\"><a href=\"#swings\">כל התזוזות הגדולות ←</a></p>" : "<p>אין השוואה לרשימה זו.</p>") + "<div class=\"src\">" + srcNb + "</div>" },
      { s: { mode: "turnout", region: "all" }, h: "מי הלכה להצביע",
        b: "<p>אחוז ההצבעה בקלפיות הרגילות ב-2026 היה " + pct(nat.vo / nat.el) + ". בשכונות עם לפחות 2,000 בעלי זכות הוא נע בין " + pct(nbT[nbT.length - 1].vo / nbT[nbT.length - 1].el) + " (" + esc(nbT[nbT.length - 1].name) + ", " + esc(nbT[nbT.length - 1].town) + ") ל-" + pct(nbT[0].vo / nbT[0].el) + " (" + esc(nbT[0].name) + ", " + esc(nbT[0].town) + ").</p>" +
          (sesLo && sesHi ? "<p>באזורים סטטיסטיים באשכול חברתי-כלכלי " + sesKeys[0] + ": " + pct(sesLo.vo / sesLo.el) + "; באשכול " + sesKeys[sesKeys.length - 1] + ": " + pct(sesHi.vo / sesHi.el) + ".</p>" : "") +
          "<p class=\"small\"><a href=\"#turnout\">לפירוט ←</a></p><div class=\"src\">מקור: data/kalpiot26.json, data/nb.json, data/sa.json (אשכול למ\"ס 2021).</div>" }
    ];
    $("steps").innerHTML = STEPS.map(function (x, i) { return '<article class="step" data-i="' + i + '"><h3>' + x.h + "</h3>" + x.b + "</article>"; }).join("");
    var steps = document.querySelectorAll(".step"), curStep = -1;
    function enter(i) {
      if (i === curStep) return; curStep = i; stopPlay();
      Array.prototype.forEach.call(steps, function (e, j) { e.classList.toggle("on", j === i); });
      set(STEPS[i].s);
    }
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) enter(+e.target.getAttribute("data-i")); }); }, { rootMargin: MOBILE.matches ? "-55% 0px -25% 0px" : "-40% 0px -45% 0px" });
      Array.prototype.forEach.call(steps, function (e) { io.observe(e); });
    }
    // deep link for screenshots/sharing: story.html#step=3
    var m = /step=(\d+)/.exec(location.hash); enter(m ? Math.min(STEPS.length - 1, +m[1]) : 0);

    // ---------------- swings section ----------------
    $("swingintro").textContent = "השינוי בנקודות אחוז בין 2022 ל-2026 לכל רשימה שהתמודדה בשני המועדים באותו שם, בשכונות עם לפחות " + fmt(MINV) + " קולות כשרים בכל מערכת (" + fmt(swings(cont[0] || natRank[0]).length) +
      " שכונות). שם זהה אינו מבטיח רשימה זהה: הרכבים, איחודים ופיצולים משתנים, ולכן זו השוואה זהירה. 2026 מחושב מהקלפיות שבתוך השכונה, 2022 מקבצי השכונות של ועדת הבחירות.";
    function swingTable(n, dir) {
      var s = swings(n), rows = dir > 0 ? s.slice(0, 8) : s.slice(-8).reverse();
      return '<div class="card"><h3><span class="sw" style="background:' + color(n) + '"></span>' + esc(n) + ": " + (dir > 0 ? "העליות הגדולות" : "הירידות הגדולות") + '</h3><div class="tablewrap"><table class="t"><thead><tr><th>שכונה</th><th>2022</th><th>2026</th><th>שינוי</th></tr></thead><tbody>' +
        rows.map(function (r) { return "<tr><td>" + esc(r.o.name) + '<div class="small muted">' + esc(r.o.town) + '</div></td><td class="n">' + pct(r.a) + '</td><td class="n">' + pct(r.b) + '</td><td class="n ' + (r.d >= 0 ? "up" : "dn") + '">' + pp(r.d) + "</td></tr>"; }).join("") + "</tbody></table></div></div>";
    }
    var sp = cont.slice(0, 2);
    $("swingtables").innerHTML = sp.map(function (n) { return swingTable(n, 1) + swingTable(n, -1); }).join("");
    $("swingall").innerHTML = '<table class="t"><thead><tr><th>רשימה</th><th>ארצי 2022→2026*</th><th>העלייה הגדולה</th><th>הירידה הגדולה</th></tr></thead><tbody>' + cont.map(function (n) {
      var s = swings(n), hi = s[0], lo = s[s.length - 1], a = (ysum["2022"].v[n] || 0) / ysum["2022"].valid, b = (ysum["2026"].v[n] || 0) / ysum["2026"].valid;
      return '<tr><td><span class="sw" style="background:' + color(n) + '"></span>' + esc(n) + '</td><td class="n">' + pct(a) + " → " + pct(b) + ' <span class="' + (b >= a ? "up" : "dn") + '">(' + pp(b - a) + ")</span></td><td>" + esc(hi.o.name) + ", " + esc(hi.o.town) + ' <span class="up">' + pp(hi.d) + "</span></td><td>" + esc(lo.o.name) + ", " + esc(lo.o.town) + ' <span class="dn">' + pp(lo.d) + "</span></td></tr>";
    }).join("") + '</tbody></table><p class="small muted">* סכום כל שכונות ועדת הבחירות, ללא מעטפות כפולות. רשימות מעל 1% ארצית ב-2026 שהתמודדו גם ב-2022 באותו שם.</p>';

    // ---------------- national three-election table ----------------
    var names = {};
    YEARS.forEach(function (y) { Object.keys(ysum[y].v).forEach(function (n) { if (ysum[y].v[n] / ysum[y].valid >= 0.025) names[n] = 1; }); });
    var nl = Object.keys(names).sort(function (a, b) { return (ysum["2026"].v[b] || 0) - (ysum["2026"].v[a] || 0) || (ysum["2022"].v[b] || 0) - (ysum["2022"].v[a] || 0) || (ysum["2021"].v[b] || 0) - (ysum["2021"].v[a] || 0); });
    var mx = 0; nl.forEach(function (n) { YEARS.forEach(function (y) { mx = Math.max(mx, (ysum[y].v[n] || 0) / ysum[y].valid); }); });
    $("sharesintro").textContent = "אחוז הקולות הכשרים לכל רשימה שעברה 2.5% לפחות באחת המערכות, בסכום שכונות ועדת הבחירות (אותה יחידה בשלוש המערכות: " +
      YEARS.map(function (y) { return y + " " + fmt(ysum[y].valid) + " קולות"; }).join(", ") + "). \"—\" = לא התמודדה בשם זה באותה שנה.";
    $("sharetable").innerHTML = '<table class="t"><thead><tr><th>רשימה</th>' + YEARS.map(function (y) { return "<th>" + y + "</th>"; }).join("") + "</tr></thead><tbody>" + nl.map(function (n) {
      return '<tr><td><span class="sw" style="background:' + color(n) + '"></span>' + esc(n) + (COL[n] ? "" : "*") + "</td>" + YEARS.map(function (y) {
        if (!RAN[y][n]) return '<td class="n muted">—</td>';
        var s = (ysum[y].v[n] || 0) / ysum[y].valid; return '<td class="n"><div class="yrcell"><span>' + pct(s) + '</span><span class="mini"><i style="width:' + (s / mx * 100).toFixed(1) + "%;background:" + color(n) + '"></i></span></div></td>';
      }).join("") + "</tr>";
    }).join("") + '</tbody></table><p class="small muted">* צבע תצוגה לרשימה שלא התמודדה ב-2026 בשם זה. מקור: <a href="' + REPO + 'data/nb.json">data/nb.json</a>.</p>';

    // ---------------- turnout section ----------------
    var envVoters = BS.voters - nat.vo;
    $("turnintro").textContent = "אחוז ההצבעה = מצביעים בקלפי חלקי בעלי זכות הבחירה הרשומים בה, בקלפיות הרגילות בלבד (" + fmt(nat.vo) + " מתוך " + fmt(nat.el) + ", " + pct(nat.vo / nat.el) + "). " +
      (envVoters > 0 ? "לפי data/build_stats.json היו בסך הכול " + fmt(BS.voters) + " מצביעים כולל המעטפות הכפולות (" + pct(BS.voters / BS.eligible) + " מבעלי הזכות); קולות המעטפות אינם משויכים למקום, ולכן המפה מציגה את החלק המקומי בלבד. " : "") +
      "אין בקבצים נתוני אחוז הצבעה ל-2022 ול-2021, ולכן זה רק 2026.";
    var smax = 0; sesKeys.forEach(function (k) { smax = Math.max(smax, ses[k].vo / ses[k].el); });
    $("seschart").innerHTML = sesKeys.map(function (k) { var s = ses[k], v = s.vo / s.el; return '<div class="sesbar"><span>אשכול ' + k + '</span><span class="tr"><span class="fi" style="display:block;width:' + (v / smax * 100).toFixed(1) + '%"></span></span><span class="pv">' + pct(v) + "</span></div>"; }).join("");
    $("sesnote").innerHTML = "1 = הנמוך, 10 = הגבוה (מדד חברתי-כלכלי של הלמ\"ס, 2021). כל קלפי שויכה לאזור הסטטיסטי שבו נמצא מקום הקלפי (לא מקום המגורים). " + (ses[0] ? fmt(ses[0].n) + " קלפיות בלי אשכול ידוע לא נכללו. " : "") + 'מקור: <a href="' + REPO + 'data/sa.json">data/sa.json</a>, <a href="' + REPO + 'data/kalpiot26.json">data/kalpiot26.json</a>.';
    function tl(list) { return '<table class="t"><tbody>' + list.map(function (t) { return "<tr><td>" + esc(t.name) + '</td><td class="n">' + pct(t.vo / t.el) + '</td><td class="n small muted">' + fmt(t.el) + " בעלי זכות</td></tr>"; }).join("") + "</tbody></table>"; }
    $("towns").innerHTML = '<p class="small muted">יישובים עם לפחות 10,000 בעלי זכות (' + fmt(bigTowns.length) + " יישובים).</p><h3 class=\"small\">הגבוה ביותר</h3>" + tl(bigTowns.slice(0, 6)) + '<h3 class="small" style="margin-top:1rem">הנמוך ביותר</h3>' + tl(bigTowns.slice(-6).reverse());

    // ---------------- sources ----------------
    $("srcs").innerHTML = "<p>העמוד טוען את קובצי הנתונים של האתר ומחשב הכול בדפדפן, בלי מספרים שנכתבו ביד. גרסת הנתונים: " + esc(asOfTxt || K.built) + ".</p><ul>" +
      '<li><a href="' + REPO + 'data/kalpiot26.json">data/kalpiot26.json</a>: ' + fmt(nk) + " קלפיות רגילות ב-" + fmt(K.b.length) + ' מבנים, עם בעלי זכות, מצביעים וקולות לכל רשימה. מקור: ועדת הבחירות המרכזית דרך <a href="https://github.com/harelc/elections-vote-transfer" target="_blank" rel="noopener">harelc/elections-vote-transfer</a> (CC BY-NC-SA 4.0); מקומות הקלפי: <a href="https://www.govmap.gov.il/?lay=243675" target="_blank" rel="noopener">GovMap שכבה 243675</a> דרך <a href="https://github.com/shaielc/Behirot" target="_blank" rel="noopener">shaielc/Behirot</a>.</li>' +
      '<li><a href="' + REPO + 'data/nb.json">data/nb.json</a> ו-<a href="' + REPO + 'data/nb.topo.json">data/nb.topo.json</a>: ' + fmt(feats.length) + ' שכונות של <a href="https://elections.govmap.gov.il/" target="_blank" rel="noopener">אתר הבחירות של ועדת הבחירות</a>. תוצאות 2026 מחושבות מהקלפיות שמקומן בתוך השכונה; 2022 ו-2021 מקבצי השכונות של הוועדה.</li>' +
      '<li><a href="' + REPO + 'data/sa.json">data/sa.json</a>: אזורים סטטיסטיים 2022 ומדד חברתי-כלכלי 2021 של <a href="https://www.cbs.gov.il/he/Pages/geo-layers.aspx" target="_blank" rel="noopener">הלמ"ס</a>.</li>' +
      '<li><a href="' + REPO + 'data/build_stats.json">data/build_stats.json</a>: סטטוס הנתונים וספירת המעטפות הכפולות.</li>' +
      '<li>צבעי הרשימות של 2026: מתוך <code>parties</code> ב-kalpiot26.json (בהשראת <a href="https://github.com/RavBogard/israelielection" target="_blank" rel="noopener">RavBogard/israelielection</a>). לרשימות שלא התמודדו ב-2026 נבחר צבע תצוגה, מסומן ב-*.</li>' +
      '<li>קוד החישוב: <a href="' + REPO + 'pages/story.js">pages/story.js</a>. השיטה והמגבלות: <a href="about.html">איך זה עובד</a>.</li></ul>' +
      '<p class="note">ההצבעה חשאית; התוצאות הן לקלפי, למבנה ולשכונה, לא לאדם. שכונה נקבעת לפי מקום הקלפי ולא לפי מקום המגורים. השוואה בין שנים נעשית לפי שם הרשימה בלבד.</p>';
    $("story").setAttribute("aria-busy", "false");
    resize();
  }
})();
