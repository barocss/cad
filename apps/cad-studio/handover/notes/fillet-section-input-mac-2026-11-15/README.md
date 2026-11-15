# D1410 — Fillet section input range

## Scope

Completes #121 and the remaining field-range condition of #122 after D1409. Creation and History use the native open interval `0 < value < 1`, without rounding or epsilon changes. Rho/Tension are unitless section-shape values. Endpoint/blank/nonfinite drafts receive one owned field message, custom validity and Apply/Enter guards. Invalid edits cancel queued Apply before a late preview can commit. Hidden section values and unrelated native geometry refusals retain their existing behavior. No kernel/schema or binding capability expansion.

## Verification

- Focused Studio tests 52/52 and retained Model tests 20/20 PASS.
- Model and Studio TypeScript checks, targeted helper/UI/Model/test lint, driver syntax, production build and diff check PASS. Full App lint retains the pre-existing unused `_k` at line2420; no full lint/CI qualification.
- Frozen actual Chrome at1024×800 and1440×900, Conic and G2: valid .005/.995/.65; invalid0/1/blank/negative/>1; one local range message; disabled Apply and Enter no-op; delayed Worker reply and queued Apply cancellation; correction without implicit commit; section switching, Cancel, History Reset, feature switching and same-ID native Open PASS.
- Numeric .7, Radius parameter binding, Undo/Redo and Save/fresh Open preserve strict native geometry. Twelve independent oracle invocations PASS. Conic native11953.183403113646 versus independent11953.18340315294 mm³; G2 native11962.331428571448 versus independent11962.331428571428 mm³. Maximum section residual5.684369641588655e-13 mm. Limits5e-6 mm³ and1e-7 mm.
- Receipt `d1410-first/receipt.json` SHA256 `6ad14327195f9b33468927dbedd043c4e3eaa7c97d1b855cc4edcc6a52a05ce1`: PASS, errors0, console errors0, source changes0 across961 sources, eight contexts/browser/server closed.
- Visual review:1024 Conic HUD and History range messages are readable and field-local;1440 G2 reopened numeric .7 and Radius binding remain visible. Existing faint G2 display shading is not a rendering fix or continuity qualification.

## Reproduce and limits

Run `D1410_SOURCE_FROZEN=1 node test/fillet-section-input-browser.mjs <output>` from Studio with the existing Chrome/Playwright environment and no concurrent source writers. Driver: `apps/cad-studio/test/fillet-section-input-browser.mjs`. Browser number sanitization means partial/nonfinite raw strings are additionally covered in controlled tests, not claimed as typed-browser evidence. Independent oracle covers the selected straight convex R4 box rim at .7, not all coefficients or general blends. Existing Drawing failures, API drift and HOLDs are unchanged.
