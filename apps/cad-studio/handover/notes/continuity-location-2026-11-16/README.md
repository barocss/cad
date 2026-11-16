# Native continuity candidate location (#116)

Base: `079b60aca94bf25e4606877cc44f075d59df7387`.

## Contract

The existing Worker `curve` read supplies native-edge location samples for the candidate chosen in Edge continuity. Amber SVG dots identify those positions, including straight tangent/G2 boundaries omitted by ordinary display-edge ink. These are sampled location annotations shown through geometry, not exact continuous edge ink, depth-tested selection, or the eight face-continuity measurement samples. The panel states this distinction. Geometry, topology mapping, document/history, the native measurement API and its numeric values are unchanged.

The location hook keys results by current display/document/selection owner and request ticket. Changing the candidate clears old dots immediately; late replies cannot overwrite another candidate or a new document. Entering an incompatible mode or History editor clears the annotation. Remeasuring the same retained candidate after closing History requests its location again. Projection reuses the existing finite/viewport/eye clipping helper; annotations never intercept pointer input.

## Acceptance on 2026-11-16

- Relevant unit/SSR/projection regressions: **22/22 PASS** (`continuity-location edge-continuity-scope continuity-angle-label step-continuity-help curvature-comb-segments curvature-comb-runs`). Zero-curvature edges retain dots, invalid/clipped projections omit dots, no connecting ink is invented, and input measurements stay unchanged.
- Final Studio TypeScript and production build **PASS** (5.07s); changed non-App TypeScript ESLint and `git diff --check` **PASS**. The pre-existing App.tsx `_k` unused lint error documented in the preceding scope note remains; full App lint is not claimed clean.
- `CONTINUITY_LOCATION_FROZEN=1 node test/continuity-location-browser.mjs <output>`: **PASS** on actual Chrome WebGPU at **1024×800 and 1440×900**. Synthetic 30×12×20 box, R2 G2 tension 0.5. Candidates `n2_e16` and `n2_e17` occupy distinct upper-boundary segments. Native points lie at y=2,z=20 and rendered sample positions match independent native-read points projected by the active camera within **0.01px**. Both screenshots were visually inspected. Selecting, measuring and opening/closing History preserve the document. History suppresses dots and same-candidate remeasurement restores them.
- Controlled transport delay of real Worker curve replies: old candidate delivered after a newer candidate cannot replace its dots; delayed reply delivered after New cannot restore dots or the old selector. Both widths pass. No substituted geometry or measurement values.
- `CONTINUITY_SCOPE_FROZEN=1 node test/edge-continuity-scope-browser.mjs <output>`: **PASS**, both widths. Circle display-edge ambiguity is disclosed; a native candidate measures; closed tetrahedral mesh has explicit empty-result recovery and keyboard focus without a disabled Measure control.
- `D1258_SOURCE_FROZEN=1 node test/edge-continuity-browser.mjs <output>`: **PASS**, 1440×900. Existing directly mapped perpendicular rim and tangent joint measurements (90°/0°), keyboard focus and same-ID document replacement remain valid. First attempt stopped at source preparation because the required Model source was absent from the frozen capsule; the driver now explicitly adds that unchanged source to `extraFrozen` and the rerun passed.
- Final browser receipts have no runtime/console errors and no frozen-source changes. Independent review found no stale-overlay safety blocker and prompted the History remeasurement recovery covered above.

Together with the preceding scope/empty-result change, the reported #116 desktop acceptance is complete at these fixtures. General STEP imports, all hidden/assembly bodies and assistive-technology coverage are not claimed. No renderer/kernel expansion, full continuous-edge tracing or new WebGPU CI is included. Existing #126 WIP and HOLDs remain untouched.
