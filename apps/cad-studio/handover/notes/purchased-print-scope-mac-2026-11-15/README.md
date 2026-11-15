# D1334 — Purchased body Print and 3MF scope (#569)

## Implementation

The shared notice-only printSourceScope uses the existing madeBodies and visibility rules. Print status names included made roots and excluded purchased roots, explains that selectable canvas geometry is not a layer result, and points to Inspect → BOM. All-visible-purchased has a distinct empty-source reason. Scope guidance is suppressed for stale geometry and unrelated blockers. 3MF success names visible purchased roots included by its unchanged visibility-only rule, explicitly distinguishing Print layers. No selection, geometry, slicing, BOM or export filter changes.

## Independent Mac verification

- Scope and related Print helper tests8/8 PASS: default purchase, explicit overrides, hidden exclusion, all-purchased vs empty, naming/key, input and mesh identity; final focused source/open subset6/6 PASS.
- Studio type-check, changed focused lint (App baseline unused _k remains separate), production build, diff check and independent ownership review PASS.
- Native Box10×10×6 plus ShaftØ10×20 fixture through real Open/BOM at1024×900 and1440×900. Made→bought→hide Box yields100→30→no layers. Current source/exclusion/BOM guidance visible. With Printed up to layer off, purchased Shaft top face is still selected by actual pointer click, explicitly distinguished by status. Downloaded3MF XML contains2 objects then1 when Box hidden; scope notice names purchased shaft. Undo/Redo restores layer series30→100→30; made override restores100. Save/fresh Open preserves final document.
- Actual1024px mixed/all-purchased screenshots reviewed; existing status and notification remain readable. Browser driver test/purchased-print-scope-browser.mjs receipt SHA256 `cbe29e721fb558e596abaec2e586929d70f5cf66fe6cc03d3b7f4e59d58307b0`.
- Initial driver runs toggled already-active Print off, then expected a shortened Shaft name. Corrected selectors/assertion to existing UI behavior; final source-frozen run PASS.

## Limits / next

Placed assemblies, alternative purchased kinds in browser, external slicer, mobile/AT and full suite NOT_RUN. Default purchased kinds are helper-tested. No production slicing or manufacturing guarantee. CI not awaited, generated-doc drift and all HOLDs persist. Next D1335/#110 returns to the earliest unresolved data-protection entry in #44: prevent Delete/Backspace removing prior annotations during pending Drawing placement.
