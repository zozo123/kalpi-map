/* about.html: fills the few counts in the text from data/build_stats.json, so nothing is hard-coded. */
(function () {
  "use strict";
  function fmt(n) { return Number(n).toLocaleString("he-IL"); }
  function put(k, h) { var e = document.querySelector('[data-k="' + k + '"]'); if (e) e.innerHTML = h; }
  fetch("data/build_stats.json").then(function (r) { return r.json(); }).then(function (s) {
    var st = s.source_status || {}, env = s["result_rows_without_location (double envelopes etc.)"];
    put("regular", "בגרסה הנוכחית: " + fmt(st.regular_ballots || s.joined_kalpiot) + " קלפיות רגילות, " + fmt(s.eligible) + " בעלי זכות בחירה.");
    put("buildings", fmt(s.buildings) + " מבנים ל-" + fmt(s.joined_kalpiot) + " קלפיות" + (s.unmatched_places && !s.unmatched_places.length ? ", וכל מקומות הקלפי חוברו לתוצאות." : "."));
    if (env != null) put("env", "בגרסה הנוכחית " + fmt(env) + " שורות כאלה אינן מוצגות.");
    if (st.as_of) put("ver", "תמונת מצב רשמית של " + (st.source_he || "ועדת הבחירות המרכזית") + " מ-" + new Date(st.as_of).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "long", timeStyle: "short" }) + " (שעון ישראל).");
  }).catch(function () {});
})();
