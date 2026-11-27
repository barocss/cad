# D2069 — Compare final-only and per-feature feedback on one locked plate

P1 [row 04](../../roadmap-rows/04.md), [row 08](../../roadmap-rows/08.md) · [#754](https://github.com/barocss/cad/issues/754) · Base `65e5b69a2f1f4fda46db9dba8188d5cef37ac870`.

Use the D2067 and D2068 60 × 40 × 5 mm plate in the authored frame. Require Ø6 at (15, 20) and Ø8 at (45, 20). The trial requires an explicit millimetre declaration and one stationary, closed locked mesh. The accepted reference has 276 triangles. Native candidates require one strict-valid solid, the exact bounds, location-specific bore diameters and two through passages between the exterior caps. The locked reference SHA-256 stays `c21004b7f105b977f3ced4534151cded3a8895c232591004923e822357879590`.

Each selector can try eight programs from the same two thicknesses (5 or 6 mm), two left-hole centres ((15, 20) or (18, 20)) and two right-hole depths (through or 4.9 mm blind). Both use the same candidate order, prefix reuse, stopping rule and budget of six native evaluations per run. One evaluation means one exact native body read after a shape-changing operation. The initial stock includes the fixed rectangle sketch. Both selectors see terminal evidence and can rule out a measured error that later catalog operations cannot change. One selector also sees that evidence at each successful prefix. The study records each evaluation, its revision, visible score and refusal reason. It retains the best observed overlap separately from the best admissible design.

The overlap score samples the tessellated geometry at fixed 0.25 mm XY spacing and integrates occupied Z intervals. This resolves the 0.1 mm blind floor in the sample. The exact gate uses the native B-rep and authored dimensions. It does not infer dimensions or scale from the overlap score.

| First preference (stock, left, right) | Final-only reads and status | Per-feature reads and status |
| --- | --- | --- |
| correct, correct, correct | 3, PASS | 3, PASS |
| wrong, correct, correct | 6, PASS | 4, PASS |
| correct, wrong, correct | 5, PASS | 4, PASS |
| wrong, wrong, correct | 6, FAIL | 5, PASS |
| correct, correct, wrong | 4, PASS | 4, PASS |
| wrong, correct, wrong | 6, FAIL | 5, PASS |
| correct, wrong, wrong | 6, PASS | 5, PASS |
| wrong, wrong, wrong | 6, FAIL | 6, PASS |

Final-only qualifies 5/8 at 42 reads. Per-feature qualifies 8/8 at 36 reads. The latter stops earlier in some trials. Both had the same six-read allowance in every pair. In the last order, final-only ends at revision `e6668d08d83247a3`, IoU 0.984826, with the wrong bore centre and unverified through status. Per-feature sees the 6 mm stock and the shifted first Hole before trying the right Hole. It refuses the 4.9 mm blind Hole at `710dcee3f26e8e45` despite IoU 0.999568, then qualifies revision `da57b0cb0cbadf1a` at IoU 1. These counts apply to the deterministic selectors on this single fixture.

## Verification

- **PASS, independent controls.** The shifted bore (IoU 0.985249), missing bore (0.978839), thick stock (0.833333), near-through bore (0.999568) and swapped diameters (0.981278) each fail the exact gate. Missing source scale and an open reference mesh fail admission. The fixture stays in its original coordinates.
- **PASS, nonmonotone native path.** Edit an initial 5 mm stock to 6 mm. Keep the lower result of Split at z = 5 mm, then cut both Holes. The observed overlap is 0.967318 → 0.806098 → 0.967318 → 0.978839 → 1. The final native solid passes the same strict gate. Intermediate construction can lower the score.
- **PASS, desktop Studio.** Stage the selected result through local level-one MCP. Match its pending native body digest (`a7e80eb9604d9caa6887a8c8f480becdc53d1f5ba987815161a34f9861294142`) and reference to the study. Preview and Hide preserve the document. Explicit Accept creates the body. Native Save and fresh Open preserve it. Edit only the left Hole to Ø10, Undo, Redo, Save and fresh Open. The right Hole and reference retain their original IDs and dimensions. Also open the rejected 3 mm centre shift in Studio and match its body digest to the study. All 1,339 frozen inputs and the zero-error console receipt are retained through cleanup.
- **PASS, focused checks.** Studio checks pass 20/20, including the three study tests. Scoped ESLint, browser-driver syntax, Studio type check and diff check pass.
- **FAIL, development controls.** The first temporary-bore cleanup recipe lacked the required Delete face signature. Using the existing command fixed that input and restored sampled overlap, but its healed chart remained outside the strict through-bore admission. The final witness uses native Split and qualifies both openings. An initial type check also caught an optional editor callback. The final harness asserts its presence.
- **NOT_RUN.** Live model performance, other reference families, production build locally, full local suites and mobile. The study supports closeout of the original synthetic research scope. First mechanical CAD remains 8/10. Overall completion remains unmeasured.

```sh
# Use Node 22.19.0. Acquire the heavy gate before each test run.
pnpm --dir apps/cad-studio test locked-plate-study proposal-review-availability toolset-mcp tool-contract-mcp
tsc --noEmit -p apps/cad-studio
LOCKED_PLATE_BORE_FROZEN=1 node --import "$LOCAL_PLAYWRIGHT_PRELOAD" apps/cad-studio/test/locked-plate-bore-browser.mjs "$OUT/verified"
```
