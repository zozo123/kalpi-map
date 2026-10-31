/* kalpi-map · share module (self-contained, no dependencies, no network calls except the site's own data/*.json).
 *
 * What it adds, after each address search:
 *   1. a quiz card ("guess who came first in your neighborhood") that can gate the neighborhood card until answered;
 *   2. a "share my area" card: canvas-rendered PNG, 1080x1350 (story/feed) and 1200x630 (link-preview size),
 *      Web Share API with files on mobile, download fallback everywhere else;
 *   3. WhatsApp / Telegram / X / Facebook buttons with prefilled Hebrew text and a ?q= deep link.
 *
 * How it hooks in: it watches #results (MutationObserver) and reads window.kalpiLast, which app.js already sets
 * in locate(). Optionally app.js can call  document.dispatchEvent(new CustomEvent("kalpi:located"))  instead.
 * The share text never names a party (nonpartisan); the image shows the computed shares only.
 * All numbers are computed from data/kalpiot26.json, data/nb.json and data/hist.json at runtime.
 */
(function () {
  "use strict";
  var CFG = window.KalpiShareConfig || {};
  var SITE = CFG.siteUrl || "https://zozo123.github.io/kalpi-map/";
  var SITE_LABEL = CFG.siteLabel || "zozo123.github.io/kalpi-map";
  var BASE = CFG.dataBase || "data/";          // relative to the page
  var QUIZ = CFG.quiz !== false;                 // the guessing quiz before the results (off on the live site)
  var QUIZ_GATE = QUIZ && CFG.quizGate !== false;        // blur the neighborhood card until the quiz is answered or skipped
  var TOP_N = 6;
  var FONT = CFG.font || '"Heebo","Assistant","Noto Sans Hebrew","IBM Plex Sans Hebrew",Arial,system-ui,sans-serif';
  var NEUTRAL = { bg: "#f6f4ef", ink: "#141414", muted: "#5a5852", line: "#dcd7cc", accent: "#1f4e8c", track: "#ebe7de" };

  // ---------- analytics hook (DISABLED BY DEFAULT) ----------
  // track() is a no-op. Events fired: quiz_shown, quiz_answered{correct}, quiz_skipped, card_rendered{size},
  // share_native, share_download, share_click{net}. No address, coordinates or area name is ever passed.
  // To enable cookieless, privacy-friendly counting later, replace the body with ONE of these (and add the
  // provider's script tag to index.html), after updating the privacy note on the page:
  //   Plausible:   window.plausible && window.plausible(ev, { props: props });
  //   GoatCounter: window.goatcounter && window.goatcounter.count({ path: "event/" + ev, event: true });
  //   Umami:       window.umami && window.umami.track(ev, props);
  function track(ev, props) { /* intentionally disabled */ }

  var D = null, N = null, H = null, P = null, dataP = null, nbOfKalpi = null;
  function load() {
    if (!dataP) dataP = Promise.all(["kalpiot26.json", "nb.json", "hist.json"].map(function (f) {
      return fetch(BASE + f).then(function (r) { if (!r.ok) throw new Error(f); return r.json(); });
    })).then(function (a) {
      D = a[0]; N = a[1]; H = a[2]; P = D.parties;
      D.byId = {}; D.b.forEach(function (b) { b.k.forEach(function (k) { D.byId[k[0]] = { b: b, k: k }; }); });
    }).catch(function (e) { dataP = null; throw e; });
    return dataP;
  }
  var pname = function (n) { return String(n).replace(/\s*\(לא התמודדה\)$/, ""); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var pct1 = function (x) { return (x * 100).toFixed(1) + "%"; };
  var fmt = function (n) { return Number(n).toLocaleString("he-IL"); };

  // ---------- area model ----------
  // Area = the CEC neighborhood of the nearest in-locality kalpi (same rule as the site's neighborhood card);
  // fallback = the 5 nearest polling places, with 2022 from the harelc crosswalk in hist.json.
  function sharesFromVec(vec, valid, names) {
    var by = {};
    for (var i = 0; i < vec.length; i += 2) { var n = pname(names(vec[i])); by[n] = (by[n] || 0) + vec[i + 1]; }
    var o = {}; Object.keys(by).forEach(function (n) { o[n] = by[n] / valid; }); return o;
  }
  function colorOf(name) { for (var i = 0; i < P.length; i++) if (pname(P[i][1]) === name) return P[i][4]; return "#8c939b"; }
  // 2026 shares from a list of kalpi rows; 2022 from the harelc crosswalk groups (each group counted once)
  function fromKalpiot(A, ks) {
    var votes = {}, valid = 0;
    ks.forEach(function (k) { for (var j = 0; j < k[6].length; j += 2) { votes[k[6][j]] = (votes[k[6][j]] || 0) + k[6][j + 1]; valid += k[6][j + 1]; } });
    A.valid = valid; var vec = []; Object.keys(votes).forEach(function (j) { vec.push(+j, votes[j]); });
    A.now = sharesFromVec(vec, valid, function (j) { return P[j][1]; });
    var gs = {}, E = H["25"];
    ks.forEach(function (k) { var e = H.k[k[0]]; if (e && e[0] >= 0) gs[e[0]] = 1; });
    var pv = 0, pvec = {};
    Object.keys(gs).forEach(function (g) { var G = E.groups[g]; pv += G[1]; for (var j = 0; j < G[2].length; j += 2) pvec[G[2][j]] = (pvec[G[2][j]] || 0) + G[2][j + 1]; });
    if (pv) { var v2 = []; Object.keys(pvec).forEach(function (j) { v2.push(+j, pvec[j]); }); A.prev = sharesFromVec(v2, pv, function (j) { return E.parties[j][1]; }); A.prevNames = {}; E.parties.forEach(function (p) { A.prevNames[pname(p[1])] = 1; }); }
    A.quality = "2022: שיוך קלפיות (harelc)" + (A.kind === "near" ? ", משוער" : "");
  }
  function buildArea(last) {
    var ids = (last && last.barzel) || [];
    if (!ids.length) return null;
    var u = null, city = null;
    for (var i = 0; i < ids.length && u == null; i++) {
      var e = D.byId[ids[i]]; if (!e) continue;
      if (last.c && e.b.c !== last.c) continue;
      if (N.k[ids[i]] != null && N.n[N.k[ids[i]]]) u = N.k[ids[i]];
    }
    var A = { kind: null, name: "", city: "", now: {}, prev: null, prevNames: null, eligible: 0, voters: 0, valid: 0, kalpiot: 0, quality: "" };
    var ks = [];
    if (last.prec === "settlement" && last.c) { // bare locality search: the whole locality
      D.b.forEach(function (b) { if (b.c === last.c) { city = b.t; b.k.forEach(function (k) { ks.push(k); }); } });
      A.kind = "loc"; A.name = city; A.city = "";
      fromKalpiot(A, ks);
    } else if (u != null) {
      var r = N.n[u];
      A.kind = "nb"; A.name = r[2]; A.city = r[1];
      Object.keys(D.byId).forEach(function (id) { if (N.k[id] === +u || N.k[id] === u) ks.push(D.byId[id].k); });
      A.valid = r[3]; A.now = sharesFromVec(r[4], r[3], function (j) { return P[j][1]; });
      if (r[5]) { A.prev = sharesFromVec(r[6], r[5], function (j) { return N.p25[j][1]; }); A.prevNames = {}; N.p25.forEach(function (p) { A.prevNames[pname(p[1])] = 1; }); }
      A.quality = "2022: קובץ השכונות של ועדת הבחירות לאותה שכונה";
    } else {
      var seen = {};
      ids.forEach(function (id) { var e = D.byId[id]; if (e && !seen[id]) { seen[id] = 1; ks.push(e.k); city = city || e.b.t; } });
      A.kind = "near"; A.name = "סביבת הכתובת"; A.city = city || "";
      fromKalpiot(A, ks);
    }
    ks.forEach(function (k) { A.eligible += k[2]; A.voters += k[3]; });
    A.kalpiot = ks.length;
    A.rows = Object.keys(A.now).sort(function (a, b) { return A.now[b] - A.now[a]; }).slice(0, TOP_N).map(function (n) {
      var d = A.prev && A.prevNames[n] ? A.now[n] - (A.prev[n] || 0) : null;
      return { name: n, s: A.now[n], d: d, color: colorOf(n) };
    });
    A.label = A.kind === "loc" ? A.name : A.name + (A.city ? ", " + A.city : "");
    A.query = A.kind === "nb" ? A.name + ", " + A.city : A.kind === "loc" ? A.name : (A.city || "");
    return A;
  }

  // ---------- canvas card ----------
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function txt(ctx, s, x, y, size, weight, color, align, dir) {
    ctx.font = (weight || 400) + " " + size + "px " + FONT; ctx.fillStyle = color || NEUTRAL.ink;
    ctx.textAlign = align || "right"; ctx.direction = dir || "rtl"; ctx.fillText(s, x, y);
  }
  function fit(ctx, s, maxW, size, weight) { // shrink font until it fits
    for (var z = size; z > 18; z -= 2) { ctx.font = weight + " " + z + "px " + FONT; if (ctx.measureText(s).width <= maxW) return z; }
    return 18;
  }
  function deltaLabel(d) { // isolate the signed number (U+2066 LRI … U+2069 PDI) so RTL text never flips the sign
    if (d === null) return "לא התמודדה ב-2022 בשם זה";
    var v = d * 100; return "לעומת 2022: \u2066" + (v > 0.05 ? "+" : v < -0.05 ? "−" : "±") + Math.abs(v).toFixed(1) + "\u2069 נק׳ אחוז";
  }

  function drawDelta(ctx, d, x, y, z) { // RTL-safe: "לעומת 2022:" | "+1.7" (LTR run) | "נק׳"
    if (d === null) return txt(ctx, "לא התמודדה ב-2022 בשם זה", x, y, z, 400, NEUTRAL.muted);
    var v = d * 100, sign = v > 0.05 ? "+" : v < -0.05 ? "−" : "±", num = Math.abs(v).toFixed(1);
    var lab = "לעומת 2022:"; txt(ctx, lab, x, y, z, 400, NEUTRAL.muted); x -= ctx.measureText(lab).width + z * 0.35;
    // sign and digits are drawn as separate runs so no bidi algorithm can move the sign
    ctx.font = "700 " + z + "px " + FONT; var nw = ctx.measureText(num).width, sw = ctx.measureText(sign).width;
    txt(ctx, sign, x - nw - 1, y, z, 700, NEUTRAL.accent, "right", "ltr");
    txt(ctx, num, x, y, z, 700, NEUTRAL.accent, "right", "ltr"); x -= nw + sw + z * 0.35;
    txt(ctx, "נק׳ אחוז", x, y, z, 400, NEUTRAL.muted);
  }
  function drawBars(ctx, A, x0, x1, y, rowH, scale) {
    var max = Math.max.apply(null, A.rows.map(function (r) { return r.s; })) || 1;
    var nameW = 300 * scale, pctW = 120 * scale;
    A.rows.forEach(function (r, i) {
      var yy = y + i * rowH;
      var nz = fit(ctx, r.name, nameW, 34 * scale, 600);
      txt(ctx, r.name, x1, yy + 26 * scale, nz, 600, NEUTRAL.ink);
      var bx1 = x1 - nameW - 16 * scale, bx0 = x0 + pctW, bw = bx1 - bx0;
      ctx.fillStyle = NEUTRAL.track; rr(ctx, bx0, yy + 4 * scale, bw, 30 * scale, 8 * scale); ctx.fill();
      var w = Math.max(6, bw * r.s / max);
      ctx.fillStyle = r.color; rr(ctx, bx1 - w, yy + 4 * scale, w, 30 * scale, 8 * scale); ctx.fill();
      txt(ctx, pct1(r.s), x0, yy + 30 * scale, 34 * scale, 700, NEUTRAL.ink, "left", "ltr");
      drawDelta(ctx, r.d, bx1, yy + 66 * scale, 22 * scale);
    });
  }
  function drawCard(A, W, Hh) {
    var c = document.createElement("canvas"); c.width = W; c.height = Hh;
    var ctx = c.getContext("2d");
    ctx.fillStyle = NEUTRAL.bg; ctx.fillRect(0, 0, W, Hh);
    // neutral ballot-box motif: thin grey stripe at top (no party colors outside the bars)
    ctx.fillStyle = NEUTRAL.accent; ctx.fillRect(0, 0, W, 14);
    var turnout = A.eligible ? A.voters / A.eligible : null;
    var stats = fmt(A.kalpiot) + " קלפיות · " + (turnout != null ? "הצבעה בקלפיות " + pct1(turnout) + " · " : "") + fmt(A.valid) + " קולות כשרים";
    var src = "מקור: ועדת הבחירות המרכזית, נתונים נכונים ל-31.10.2026 · " + A.quality + " · אתר עצמאי ולא רשמי";
    if (W / Hh < 1) { // 1080x1350 portrait
      var m = 72, R = W - m;
      txt(ctx, "הבחירות לכנסת ה-26 · 27.10.2026", R, 92, 32, 500, NEUTRAL.muted);
      txt(ctx, "איך הצביעו באזור שלי?", R, 168, 64, 800, NEUTRAL.ink);
      txt(ctx, A.label, R, 250, fit(ctx, A.label, W - 2 * m, 56, 700), 700, NEUTRAL.accent);
      txt(ctx, stats, R, 306, fit(ctx, stats, W - 2 * m, 30, 400), 400, NEUTRAL.muted);
      ctx.fillStyle = NEUTRAL.line; ctx.fillRect(m, 340, W - 2 * m, 2);
      txt(ctx, "הרשימות הגדולות באזור, 2026 (שינוי מ-2022)", R, 400, 30, 600, NEUTRAL.ink);
      drawBars(ctx, A, m, R, 440, 120, 1);
      var fy = Hh - 210;
      ctx.fillStyle = "#fff"; rr(ctx, m, fy, W - 2 * m, 110, 20); ctx.fill();
      ctx.strokeStyle = NEUTRAL.line; ctx.lineWidth = 2; ctx.stroke();
      txt(ctx, "בדקו את הכתובת שלכם:", R - 28, fy + 48, 30, 600, NEUTRAL.ink);
      txt(ctx, SITE_LABEL, m + 28, fy + 82, 36, 700, NEUTRAL.accent, "left", "ltr");
      txt(ctx, "מקור: ועדת הבחירות המרכזית, נתונים נכונים ל-31.10.2026 · אתר עצמאי ולא רשמי", R, Hh - 62, 22, 400, NEUTRAL.muted);
      txt(ctx, A.quality + " · קלפיות רגילות בלבד · אחוזים מהקולות הכשרים", R, Hh - 30, 22, 400, NEUTRAL.muted);
    } else { // 1200x630 landscape
      var m2 = 56, mid = W * 0.47, R2 = W - m2;
      txt(ctx, "הבחירות לכנסת ה-26 · 27.10.2026", R2, 70, 24, 500, NEUTRAL.muted);
      txt(ctx, "איך הצביעו", R2, 140, 54, 800, NEUTRAL.ink);
      txt(ctx, "באזור שלי?", R2, 200, 54, 800, NEUTRAL.ink);
      var lw = W - mid - m2 - 30;
      txt(ctx, A.label, R2, 268, fit(ctx, A.label, lw, 40, 700), 700, NEUTRAL.accent);
      txt(ctx, stats, R2, 312, fit(ctx, stats, lw, 22, 400), 400, NEUTRAL.muted);
      txt(ctx, "בדקו את הכתובת שלכם:", R2, 470, 24, 600, NEUTRAL.ink);
      txt(ctx, SITE_LABEL, R2, 508, 30, 700, NEUTRAL.accent, "right", "ltr");
      ctx.fillStyle = NEUTRAL.line; ctx.fillRect(mid + 10, 60, 2, Hh - 150);
      var A5 = Object.assign({}, A, { rows: A.rows.slice(0, 5) });
      txt(ctx, "2026 (שינוי מ-2022)", mid - 10, 70, 22, 600, NEUTRAL.muted);
      drawBars(ctx, A5, m2, mid - 10, 92, 92, 0.72);
      txt(ctx, src, R2, Hh - 30, fit(ctx, src, W - 2 * m2, 16, 400), 400, NEUTRAL.muted);
    }
    track("card_rendered", { size: W + "x" + Hh });
    return c;
  }

  // ---------- share plumbing ----------
  function deepLink(q) { return SITE + (q ? "?q=" + encodeURIComponent(q) : ""); }
  function shareText(A) { return "איך הצביעו באזור שלי בבחירות לכנסת ה-26? בדקתי לפי קלפי (" + A.label + "). הקלידו כתובת ובדקו את שלכם:"; }
  function netUrl(net, text, url) {
    var t = encodeURIComponent(text), u = encodeURIComponent(url);
    return { whatsapp: "https://wa.me/?text=" + encodeURIComponent(text + " " + url),
      telegram: "https://t.me/share/url?url=" + u + "&text=" + t,
      x: "https://x.com/intent/post?text=" + t + "&url=" + u,
      facebook: "https://www.facebook.com/sharer/sharer.php?u=" + u }[net];
  }
  function toBlob(c) { return new Promise(function (ok) { c.toBlob(ok, "image/png"); }); }
  function slug(s) { return String(s).replace(/[^\u0590-\u05FFA-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "area"; }
  function shareImage(c, A, url) {
    return toBlob(c).then(function (blob) {
      var name = "kalpi-" + slug(A.label) + "-" + c.width + "x" + c.height + ".png";
      var file = typeof File === "function" ? new File([blob], name, { type: "image/png" }) : null;
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        track("share_native", {});
        return navigator.share({ files: [file], text: shareText(A) + " " + url, title: "קלפיות ותוצאות לפי כתובת" }).catch(function () {});
      }
      track("share_download", {});
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    });
  }

  // ---------- UI ----------
  var state = { A: null, answered: false, key: "" };
  function quizHtml(A) {
    var top = A.rows[0].name, pool = A.rows.slice(1, 6).map(function (r) { return r.name; });
    for (var i = pool.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    var opts = [top].concat(pool.slice(0, 3));
    for (i = opts.length - 1; i > 0; i--) { j = Math.floor(Math.random() * (i + 1)); t = opts[i]; opts[i] = opts[j]; opts[j] = t; }
    return '<div class="ks-quiz card" data-ks><h3>רגע לפני התוצאות: נחשו!</h3>' +
      '<div class="meta">איזו רשימה הגיעה למקום הראשון ב' + esc(A.label) + "?</div>" +
      '<div class="ks-opts">' + opts.map(function (o) { return '<button type="button" class="ks-opt" data-v="' + esc(o) + '">' + esc(o) + "</button>"; }).join("") + "</div>" +
      '<div class="ks-res" aria-live="polite"></div><button type="button" class="link ks-skip">דלגו ישר לתוצאות</button></div>';
  }
  function shareHtml(A) {
    return '<section class="lvl ks-share" data-ks aria-labelledby="ks-h"><h2 class="sec" id="ks-h">שתפו את האזור שלכם</h2>' +
      '<div class="meta">' + esc(A.label) + " · תמונה עם הרשימות הגדולות והשינוי מ-2022. בלי כתובת מדויקת.</div>" +
      '<canvas class="ks-preview" width="1080" height="1350" aria-label="תצוגה מקדימה של כרטיס השיתוף"></canvas>' +
      '<div class="ks-row"><button type="button" class="primary ks-img" data-w="1080" data-h="1350">שיתוף תמונה (סטורי/פיד)</button>' +
      '<button type="button" class="ks-img" data-w="1200" data-h="630">תמונה רחבה (1200×630)</button></div>' +
      '<div class="ks-row ks-nets">' +
      '<a class="ks-net ks-wa" data-net="whatsapp" target="_blank" rel="noopener">וואטסאפ</a>' +
      '<a class="ks-net ks-tg" data-net="telegram" target="_blank" rel="noopener">טלגרם</a>' +
      '<a class="ks-net ks-x" data-net="x" target="_blank" rel="noopener">X</a>' +
      '<a class="ks-net ks-fb" data-net="facebook" target="_blank" rel="noopener">פייסבוק</a>' +
      '<button type="button" class="ks-net ks-copy">העתקת קישור</button></div>' +
      '<label class="meta ks-exact"><input type="checkbox" class="ks-addr"> לשתף את הכתובת המדויקת שחיפשתי (כברירת מחדל משותפים רק השכונה והיישוב)</label></section>';
  }
  function currentQuery(exact) {
    if (exact) { var q = document.getElementById("q"); if (q && q.value.trim()) return q.value.trim(); }
    return state.A ? state.A.query : "";
  }
  function wireShare(root, A) {
    var prev = root.querySelector(".ks-preview"); var big = drawCard(A, 1080, 1350);
    prev.getContext("2d").drawImage(big, 0, 0);
    function refresh() {
      var url = deepLink(currentQuery(root.querySelector(".ks-addr").checked)), text = shareText(A);
      root.querySelectorAll("a.ks-net").forEach(function (a) { a.href = netUrl(a.getAttribute("data-net"), text, url); });
      return url;
    }
    refresh();
    root.querySelector(".ks-addr").addEventListener("change", refresh);
    root.querySelectorAll("a.ks-net").forEach(function (a) { a.addEventListener("click", function () { track("share_click", { net: a.getAttribute("data-net") }); }); });
    root.querySelector(".ks-copy").addEventListener("click", function (e) {
      var url = refresh(); var b = e.currentTarget;
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { b.textContent = "הקישור הועתק ✓"; }, function () { prompt("העתיקו את הקישור:", url); });
      track("share_click", { net: "copy" });
    });
    root.querySelectorAll(".ks-img").forEach(function (b) {
      b.addEventListener("click", function () { var w = +b.getAttribute("data-w"), h = +b.getAttribute("data-h"); shareImage(w === 1080 ? big : drawCard(A, w, h), A, refresh()); });
    });
  }
  function gate(on) {
    var nb = document.querySelector("#results .card.nb");
    if (nb) nb.classList.toggle("ks-gated", !!on);
  }
  function wireQuiz(root, A) {
    track("quiz_shown", {});
    var res = root.querySelector(".ks-res");
    root.querySelectorAll(".ks-opt").forEach(function (b) {
      b.addEventListener("click", function () {
        if (state.answered) return; state.answered = true;
        var ok = b.getAttribute("data-v") === A.rows[0].name;
        root.querySelectorAll(".ks-opt").forEach(function (x) { x.disabled = true; if (x.getAttribute("data-v") === A.rows[0].name) x.classList.add("ks-right"); });
        if (!ok) b.classList.add("ks-wrong");
        res.textContent = (ok ? "ניחשתם נכון! " : "לא בדיוק. ") + A.rows[0].name + " הגיעה למקום הראשון באזור עם " + pct1(A.rows[0].s) + " מהקולות הכשרים" +
          (A.rows[0].d !== null ? " (" + deltaLabel(A.rows[0].d) + ")." : ".");
        root.querySelector(".ks-skip").remove(); gate(false); track("quiz_answered", { correct: ok });
      });
    });
    root.querySelector(".ks-skip").addEventListener("click", function () { state.answered = true; root.remove(); gate(false); track("quiz_skipped", {}); });
  }
  function inject() {
    var results = document.getElementById("results"), last = window.kalpiLast;
    if (!results || !last || !last.barzel || !last.barzel.length) return;
    var key = last.barzel.join(",") + "|" + last.c;
    var fresh = key !== state.key;
    if (!fresh && results.querySelector("[data-ks]")) { if (QUIZ_GATE && !state.answered) gate(true); return; }
    load().then(function () {
      if (key !== (window.kalpiLast && window.kalpiLast.barzel.join(",") + "|" + window.kalpiLast.c)) return;
      if (fresh) { state.key = key; state.answered = false; state.A = buildArea(last); state.quizHtml = null; }
      var A = state.A; if (!A || !A.rows.length) return;
      results.querySelectorAll("[data-ks]").forEach(function (n) { n.remove(); });
      var before = results.querySelector(CFG.before || ".disclaimer"), anchor = results.querySelector(".card.nb") || results.querySelector(".card");
      var wrap = document.createElement("div"); wrap.innerHTML = (state.answered || !QUIZ ? "" : quizHtml(A)) + shareHtml(A);
      var quiz = wrap.querySelector(".ks-quiz"), share = wrap.querySelector(".ks-share");
      if (quiz) { results.insertBefore(quiz, results.querySelector(".card") || null); wireQuiz(quiz, A); if (QUIZ_GATE) gate(true); }
      if (before && before.parentNode === results) results.insertBefore(share, before);
      else if (anchor && anchor.nextSibling) results.insertBefore(share, anchor.nextSibling); else results.appendChild(share);
      wireShare(share, A);
    }).catch(function () {});
  }
  var timer = null;
  function schedule() { clearTimeout(timer); timer = setTimeout(inject, 60); }
  function start() {
    var r = document.getElementById("results");
    if (r) new MutationObserver(function (muts) {
      // ignore mutations caused by our own nodes
      if (muts.every(function (m) { return [].every.call(m.addedNodes, function (n) { return n.nodeType === 1 && n.hasAttribute("data-ks"); }) && m.addedNodes.length; })) return;
      schedule();
    }).observe(r, { childList: true });
    document.addEventListener("kalpi:located", schedule);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();

  window.KalpiShare = { load: load, buildArea: buildArea, drawCard: drawCard, deepLink: deepLink, netUrl: netUrl, shareText: shareText, track: track };
})();
