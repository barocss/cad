# D1411 — Fillet History identity

## Scope

Completes #123, including its varying-G2 comment. Fixed History Type, Radius mode and Section are concise read-only rows rather than disabled selectors. Current Circular/Conic/Curvature (G2) is visible inside the editor. Editable creation controls, numeric coefficient editing, native computation and schema are unchanged.

## Verification

- Focused identity/family/section regression37/37 PASS (worker focused subset26/26 also PASS). Owned product/tests lint, Studio TypeScript, production build and diff check PASS.
- Existing `fillet-family-browser.mjs` and `fillet-mode-draft-browser.mjs` History assertions now match read-only groups; HUD assertions remain unchanged. Syntax PASS; these two legacy full browser scenarios were NOT_RUN in this stage.
- New `test/fillet-section-identity-browser.mjs`: actual Chrome1024×800 and1440×900, constantR4 Conic/G2 and varyingG2 R1→R2 at25%→R4 PASS. Type/radius mode/Section groups have no interactive controls. Creation HUD remains editable; switching and Cancel preserve the source. History coefficient-only edits preserve complete document payload except that coefficient, including feature ID, edge references, endpoint/interior radii and position.
- Undo/Redo and native Save/fresh Open recover identical strict B-rep digests. Thirty independent Python oracle runs PASS. Eight axial positions and five section samples each, bounded to the selected40×30×10 box rim. Maximum section residual2.8677508336301884e-12 mm against1e-7 mm limit; native/Worker volume limit5e-6 mm³.
- Independent Hermite radius-square integral8393/27 mm³; normalized quartic removed areas1/10 at tension.5 and103/1750 at.7. Expected varying volumes11968.914814814814 and11981.704148148148 mm³; actual native11968.914814814892 and11981.704148148203 mm³. Independent read-only numerical review confirmed the formulas without a blocker.
- Receipt `d1411-first/receipt.json` SHA256 `820a55ff49335afab67553ecf7f48a875c9e02dd1a8ac13a4584cbc675832bee`: PASS, errors0, console errors0, source changes0 across960 frozen sources;14 contexts/browser/server closed.
- Direct visual review:1024 varying-G2 History clearly shows Edge/Varying/Curvature(G2), all original radius/station fields and tension.5;1440 fresh reopen retains those rows and tension.7. Existing surface shading is not a rendering qualification.

## Reproduce / limits

Run `D1411_SOURCE_FROZEN=1 node test/fillet-section-identity-browser.mjs <external-output>` from Studio with the existing Chrome/Playwright environment and frozen sources. Independent oracle has no product imports. Section samples inspect supporting surfaces, not trim boundaries; finite samples plus total volume do not prove all between-sample behavior or general continuity. This is bounded identity/edit recovery evidence, not general continuity, arbitrary blends, assistive-technology or whole-CAD acceptance. Existing Drawing failures/API drift/HOLDs are unchanged. CI was not awaited per the development instruction.
