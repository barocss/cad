# D1337 — Refuse collapsed Scale results (#137)

## Implementation

Scale materializes a disposable native result before returning it, refusing empty topology, nonfinite control geometry, invalid basic BRep topology and planar faces narrower than their incident edge tolerance. The planar width metric (twice area / perimeter) is shared with existing strict validation; no new global factor floor or curved Newton/lens/crossing admission is introduced. Ordinary transform/mass paths remain unchanged. Validation does not cache on the returned Part, preserving distinct native IDs for multi-output Scale.

A stable GEOMETRY diagnostic maps to visible Factor recovery guidance in preview, History and failed-file notices. Already saved collapsed models use the existing explicit previous-result/not-up-to-date state, not a successful current empty body, and can be repaired in History. The failed file itself is still opened; no claim of rejecting the whole file or preserving the previous file document is made.

## Verification

- Final kernel regression batch 75/75 PASS (`scale-admission`, `part-model`, `native-si-boundary`, `r12-3`). Focused kernel tests cover the three reported factors (5e-9, 1e-8, 2e-8), valid 0.005, source size/pivot dependence, cylinder, STEP-imported box, facet mesh and split multi-output IDs. The larger source admits 2e-8, demonstrating no universal factor floor.
- Model tests 2/2: friendly recovery preserves unrelated errors; preview/evaluation/native reopen agree and preserve source documents.
- Kernel/Model/Studio type checks, changed-source lint and Studio production build PASS. Existing bundler warnings remain; no full-suite or CI PASS claimed.
- Source-frozen Chrome/WebGPU at 1024 and 1440: all three bad factors refuse with Apply disabled and source intact; 0.005 yields one body/six faces/eight finite vertices and volume 0.000072 mm³. Undo/Redo, History refusal, Save/fresh Open, legacy failure disclosure and History repair PASS.
- Actual 1024 refusal and repaired screenshots visually reviewed. Final `scale-admission-browser.mjs` receipt SHA256: `2f8bd8c64d7e764391837a356117410250aba282d945852500323eb5bee2fa5d`; no source changes/page errors.

## Corrections and limits

Review caught and fixed premature BRep caching that could reuse native IDs across multiple output pieces; dedicated regression added. First two browser runs exposed test assumptions, not additional product faults: failed native Open intentionally adopts a failed document with stale prior geometry, and the generic same-document helper also waits for freshness. Final test checks that failure state explicitly and repairs through History. Broad curved imported families, general facet degeneracy, manufacturing tolerance, assistive technology and full exports are not qualified by this milestone. #138/#139 remain separate export-defense work. Existing HOLD scopes remain unchanged.
