/* ═══════════════════════════════════════════════
   SQB Wiki — privacy-friendly traffic analytics
   GoatCounter: no cookies, no personal profiles.
   Dashboard: https://sqb-wiki.goatcounter.com  (after you claim the code)
   Setup: https://www.goatcounter.com  → create site code "sqb-wiki"
   Free tier is for non-commercial use — fine while measuring organic growth;
   switch to a paid plan (or Plausible/Cloudflare) before running ads.
   ═══════════════════════════════════════════════ */

(function initSqbAnalytics() {
  /** Change this if your GoatCounter code differs. Empty string disables tracking. */
  const GOATCOUNTER_CODE = "sqb-wiki";

  if (!GOATCOUNTER_CODE) return;
  if (window.goatcounter || document.querySelector("script[data-goatcounter]")) return;

  const script = document.createElement("script");
  script.async = true;
  script.dataset.goatcounter = `https://${GOATCOUNTER_CODE}.goatcounter.com/count`;
  script.src = "https://gc.zgo.at/count.js";
  document.head.appendChild(script);
})();
