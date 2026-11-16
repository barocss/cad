# Rectangle Chamfer persistence after resize (#20 partial)

## Reproduction and scope

The actual pre-fix browser `/tmp/cad-rectangle-chamfer-before` reproduced the issue's ordinary Chamfer persistence failure on main2a815d4e3: D2 on the front top edge of40×30×10, Width40→60 accepts the correct17880mm³ shape but retains the40mm edge signature. Native JSON reopen then holds Chamfer. This diagnostic PASS is a confirmed product failure, not feature acceptance.

Extend the existing complete cuboid topology proof only to one terminal single-edge equal-distance Chamfer with finite positive numeric distance. Its exact field whitelist excludes held/rematched/suppressed features, bound distances, angle/second-distance extensions and extra nodes. The entire8-corner/12-edge/6-face incidence proof, exact old signature and owned evaluation/commit path remain unchanged. Equal-distance Chamfer is symmetric and has no endpoint radius law; the Fillet direction proof stays in place for varying Fillet. No new kernel API, shape tolerance or automatic edge guess. The App failure copy now names the affected feature.

Constant Fillet was separately reproduced in a source diagnostic but is deliberately not admitted in this change. Linked inset, disappearing topology, multi-edge/shaped/parameterized finish and broader #20 acceptance remain open.

## Verification

- Focused6/6 PASS, including Chamfer analytic volume and invalid/bound/unsupported schema exclusions, plus all prior topology/alias/stale-signature/direction tests. Constant Fillet remains explicitly excluded by a test.
- Helper/test lint, Studio tsc, diff --check, production build4.24s PASS. Independent read review found no additional blocker. App-inclusive lint retains the already documented unrelated `_k` unused variable; no whole-lint or full-suite success claimed.
- Frozen final actual browser `/tmp/cad-rectangle-chamfer-fixed` PASS: original shape, Width40→60, Undo/Redo, native JSON reopen without References; Depth30→36/reopen; Width60→20 shrink/reopen; invalid Depth1 refusal preserves the accepted document. Reviewed `04-reopened.png`.
- Independent Python triangle-prism removal formula V=W×D×H−W×c²/2 and native strict B-rep checks pass at11920,17880,21480,7160mm³ (last native/worker7159.999999999999). Native endpoint contacts at(x,0,H−c) and(x,c,H) for x0/W are present; removed old corners are absent. This proves selected front-top placement as well as scalar volume.
- Unchanged pending ownership lifecycle was qualified by the immediately preceding varying-Fillet cancellation run; not redundantly replayed here. Physical downloads, remote CI, whole-family acceptance are not claimed. Existing WIP/HOLD preserved.

Run from Studio under the existing heavy gate with PW_DIR/CHROME: `RECTANGLE_CHAMFER_FROZEN=1 node test/rectangle-chamfer-resize-browser.mjs <output>`. `--before-fix` is the baseline reproduction mode for2a815d4e3, not an expected pass after this fix.
