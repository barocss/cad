# Exact terminal Fillet break (#624)

## Cause and bounded change
At H12, ringFillet's face-state transition bisection produced a break whose s was exactly s1=L=12.56637028925023, with the same support indices a=b=0. H10 had only the start break. The final stretch therefore had a0=a1=s1, yet minimum n=4 caused five repeated endpoint sections to be lofted into a zero-length surface. Its control rows were repeated apart from floating-point noise; measured scaled V domain was only 1.381245202190966e-14. Downstream intersection correctly refused a usable strict-inside bracket.

After existing break sorting/merging, remove only an exact terminal s===s1 break of an open chain, while retaining the start. The preceding positive-length stretch includes the endpoint as before. Closed chains, internal/near-end breaks, original surface/domain/tolerance/contact tests and geometry are not relaxed. No nearest-point topology inference, UV clamp, coordinate rounding or general NURBS expansion. Independent read-only review accepted this narrow fix.

## Verification
- Original instrumented observations retained externally: `/tmp/cad-height-breaks-01`, `/tmp/cad-height-trace-02`. Instrumentation was never applied to product source.
- Final native fast build, Kernel type check, targeted rolling-ball lint and code-shape check PASS.
- Open-circle tests 3/3 PASS, including H12 with authored z10 and fresh z12. Existing closed-form rolling-ball boss/hole/cone control PASS; existing open square-ending general fillets R0.25–3 PASS. These are focused checks, not full-suite claims.
- Actual frozen Studio `/tmp/cad-fillet-height-fixed-02`: PASS. H10 creation and radius swap, Height10→12 Apply, unchanged authored radii, current endpoint z12 labels, Undo/Redo, New part/native JSON reopen and cleanup. Both endpoints visually reviewed in `06-taller-reopened.png`.
- Independent native/Python quarter-rim oracle H12: expected volume600.9814959450699 mm³, native600.9814957157746, worker600.9814957159081; max error2.2929532406124054e-7 mm³; five section max residual4.2812692772861087e-8 mm; radial end trim1.0670348423145127e-11 mm. H10 both radius directions also passed.
- First browser attempt fixed-01 failed in the new test reader because it passed both radius and radii to the native API. Reader corrected to radii only; no product workaround.
- Browser uses exact local native export aliases; its bounded native reader converts this sketch/extrude/fillet fixture to native features and imports the local Kernel directly. The diagnostic now also aliases local native exports, avoiding dependency symlink ambiguity.
- Older endpoint-only browser no longer asserts the now-fixed refusal; height regression lives in the dedicated driver. Its remaining endpoint flow is covered by the dedicated browser; standalone endpoint-only driver syntax checked, not separately replayed.
- Physical Project Save/download, full suites, broad surface families and remote CI NOT_RUN. Original protected checkout's eight WIP entries unchanged; all HOLD ranges preserved.

Commands: from Kernel `node scripts/tool.mjs build:fast`, `node --test test/open-circular-variable-fillet.test.mjs`, selected `r10-2.test.mjs` general closed-form and `r10-b.test.mjs` square-ending tests, `node scripts/tool.mjs type-check`, targeted eslint and `node scripts/code-shape.mjs --check`. From Studio: `FILLET_HEIGHT_FROZEN=1 node test/fillet-circular-height-browser.mjs <output>` and `node test/fillet-circular-height-diagnostic.mjs <output>`.
