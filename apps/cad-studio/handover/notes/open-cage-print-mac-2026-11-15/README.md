# D1332 — Open Print source contour warning (#566)

## Implementation

printSourceBodies shares the exact made/not-hidden filter with printSourceMeshes. printOpenSurfaceWarnings identifies included native open surfaces by name/key and native edge count. Unknown topology is not called closed/open. useWorkspacePreviews passes warnings separately from blocking reasons; PrintPanel appends them only to current ready-layer status, with actual returned closed-contour count. No geometry, slicing, support or worker changes. Open chains are omitted, so wording says contours may be incomplete rather than asserting every layer is broken.

## Independent Mac verification

- New/related filter tests5/5 PASS: hidden/bought exclusion, made override, closed/unknown silence, mixed sources and mesh identity.
- Studio type-check, changed viewport focused lint, production build, diff check and independent source/key review PASS. Existing App unused _k lint remains separate.
- Actual30×20×16 box,4 subdivisions,+X at0.2mm, layers76/101/113 at1024×900 and1440×900: closed contours[1,1,1]; delete top quad centered[3.75,2.5,16] then Done gives[1,0,1]. Warning identifies SubD box/b0 and8 native edges. Missing layer101 stays bedZ20.100mm; no contour synthesized. Normal layers/supports and native Save/fresh Open retained.
- Actual1024px missing-contour screenshot reviewed. Driver test/open-cage-print-browser.mjs receipt SHA256 `328769dfca266e89a17bceac9ba74401b9f3e2e0fde98b52049ecab8f1e2b8e8`.
- Earlier test selectors assumed buttons; actual Preview controls use labelled radio roles. Test corrected without product changes.

## Limits / next

Other directions/heights/shapes, mixed-body browser, external slicers, mobile/AT and full suite NOT_RUN. Display mesh estimation only, not production slicing. CI not awaited; existing generated-doc drift/all HOLDs persist. Next D1333/#567: explicit body/hidden export counts and actual STEP included scope, reusing D1331 STL work.
