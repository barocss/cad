# D1997: Foreshortened radius display for a source-linked drawing arc

P2 [row 11](../../roadmap-rows/11.md), [#251](https://github.com/barocss/cad/issues/251). Base `9717d60d4206e5ac8b06783aad5b51d99b8ac51d`.

A manual radius in a part's unbroken front/top/right view can shorten its displayed leader without changing the real radius, center, source edge, measured value, or solid. The final leader segment follows the native radial direction into the visible arc trim; a label beyond the trim does not move the arrow onto an imaginary continuation. The last jog has paper-mm spacing. **Move origin** previews a valid location, then one sheet click commits the patch; Esc, pointer cancellation, or a changed document/selection invalidates the draft. The body remains unchanged on add, move, and remove. Saved origin is in view-model mm with no schema bump. An origin no longer usable at the new scale or view receives a drawing warning; the saved setting is retained.

- **Actual Chrome PASS:** R500 add, Esc cancellation of origin move, committed origin move, Remove, Undo/Redo, native Save and fresh Open. Actual downloaded SVG contains R500 and a jog polyline; DXF contains R500 and the jog block polyline. Four captured states, no error, 1,241 frozen source paths with no changes.
- **Independent geometry:** `R=500` mm, source trim ±5°, analytic volume `34309.961943726536 mm³` versus actual `34309.961943726485 mm³` before and after fresh Open. Strict-valid solid, genus 0. Model tests additionally prove rim attachment at the end of the trim, radial last segment, source R500→R600 with the same authored origin and source reference, 1:2 and dual units, jog-free ordinary display, refusal/warning for invalid geometry, SVG/DXF measurement/center, 3D source target and native serialization/reorientation.
- **Focused checks:** 17 Model tests (radius/issue/3D annotation), Studio and Model type checks, scoped lint, driver syntax and clean diff. A wider local sweep showed the existing D416 and drawing-unit golden hash differences and one plate DXF fixture comparison failure; an unmodified archive of the base reproduced those same three failures. No goldens were changed.
- **Not yet qualified:** External native DXF regeneration of the dimension from its semantic entity versus preserved block, dedicated live source-edit and cross-document stale-input cases, section/detail/assembly/automatic radius and PDF. The reported sample uses an unchanged neighboring view that still triggers the existing text-over-lines warning. #251 remains open for its wider review matrix.

[Shortened R500](studio/01-foreshortened-r500.png) · [Moved origin](studio/02-moved-origin-r500.png) · [Ordinary display](studio/03-removed-foreshorten.png) · [Fresh Open](studio/04-fresh-open.png)

```sh
pnpm --filter @barocss/cad-model test drawing-foreshortened-radius drawing-issues annotations3d
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app type-check
D1997_SOURCE_FROZEN=1 node apps/cad-studio/test/drawing-foreshortened-radius-browser.mjs "$(mktemp -d /tmp/cad-d1997-replay.XXXXXX)"
```
