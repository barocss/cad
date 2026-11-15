# D1331 — Identify open surfaces and disclose STL boundaries (#565)

## Implementation

Model `engine/bodyTopology.ts` summarizes native BRep body kind, referenced shell closure and unpaired native edges. Main/preview `BodyResult.topology` carries this optional metadata. Missing/inconsistent metadata remains unknown; volume null or deferred mass never determines surface type. Geometry, masses and tessellation bytes are unchanged.

Studio footer and SelectionInspector distinguish solid, open surface, surface, mixed and unknown. Existing STL options list every actual root target by name/key, including hidden bodies, with native boundary count. Copy explicitly distinguishes native boundaries from STL mesh edges and warns that open surfaces may produce open STL boundaries. Success notice repeats the limitation. No manufacture/watertightness certification, new export refusal or changed fallback. STEP/3MF implementations are untouched.

## Independent Mac verification

- Model topology+related5/5 and UI labels2/2 PASS: real closed/open/mixed outputs, invalid metadata, preview/main, pending mass, exact counts and source preservation.
- Model/Studio type checks, changed Model/UI/file focused lint, production build and diff check PASS. Existing App unused `_k` lint and generated inventory drift remain separate.
- Public30×20×16 box with4 subdivisions, delete one top quad and Done: footer and body inspector show open surface at1024×900/1440×900. STL modal names root target and8 native boundary edges before download; screenshot visually reviewed.
- Actual binary STL independent edge counting: closed Standard16 has16294 triangles and0 boundary edges; open Automatic and Standard16 each17342 triangles and68 boundary edges at both widths. This confirms why native8 must not be described as STL68.
- Closed STEP downloads a MANIFOLD_SOLID_BREP file; open3MF still downloads and reports its existing open-edge warning. Native Save/fresh Open preserves open-surface classification. Source document unchanged through exports.
- Driver `test/open-cage-export-browser.mjs`; frozen receipt SHA256 `7f91861b4cfefc86f52f662a8d0829571291cafb10d5524c4b9a92c7271db591`.
- Initial driver looked for an unavailable command-palette STL entry; corrected to the existing toolbar, no product defect.

## Limits / next

Other cage families, hidden/mixed-body browser exports, stale-request injection, external slicers/readers, mobile/AT and full suites NOT_RUN. Existing export ownership guards unchanged. CI not awaited; all HOLDs persist. Next D1332/#566: identify missing contours from open SubD in Print layers without inventing a closed solid or changing slice geometry.
