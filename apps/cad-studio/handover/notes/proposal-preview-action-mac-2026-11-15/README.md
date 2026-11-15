# D1384 — proposal preview action and volume change

Completes #159. The existing status line shows the current before/after state once and labels its delta Volume change. The switch uses the visible and accessible next action, Show before or Show after. Numeric delta, flip callback, Preview/Hide/Accept and review guards are unchanged. No extra explanatory box.

## Verification

- Node 22.19.0: 13/13 focused proposal/history tests PASS. New cases cover next-action names, repeated flips, stable delta, source immutability and pending/unavailable states.
- Targeted ESLint, Studio TypeScript, production build and diff check PASS.
- Actual Chrome WebGPU at 1024×800 and 1440×900 PASS: Preview, mouse/Enter before/after changes, unchanged Volume change −19.13 mm³ (−0.18%), Hide, actual Accept, Undo and Redo. Before acceptance, the document and saved fixture bytes remain unchanged. Native strict BRep and document comparisons verify acceptance/history.
- Original analytic drafted-prism volume: 10572.344457521822 mm³. Accepted native volume: 10553.214670399802 mm³, matching the previously independently established #159 oracle. The preview mesh volume 10552.58953705447 is tessellated, not an exact native-volume assertion; these are kept distinct. No new independent fillet-integral derivation is claimed.
- Four before/after screenshots at both widths were visually reviewed with readable action labels and status.

Receipt: `/tmp/d1310-publish.1Wqzsz/d1384-first/receipt.json`, SHA256 `b98894280d8cfc5fe4281942b406fa1c23f8bb01e464ae8634c251fbd0e29abb`. Build log: `d1384-build.log` in the same parent directory. The first actual run passed with bounded acceptance waits.

Seven older drivers had stale generic switch locators updated: placed-proposal-preview, turn-approval, two-guide-loft-agent-proposal, arc-bore-cut-fillet-proposal, drafted-fillet-agent-proposal, state-backed-approval and browser-flow. They were syntax-checked, not browser-rerun in this step. No full-suite or screen-reader claim. Existing App lint baseline, aggregate docs/inventory drift and all HOLDs remain. CI is not awaited under the owner instruction.
