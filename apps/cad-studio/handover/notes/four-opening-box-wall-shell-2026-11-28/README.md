# D2168 — Keep two adjacent walls with four original box openings

P5 [row 07](../../roadmap-rows/07.md), [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md) · [#13](https://github.com/barocss/cad/issues/13) · Base `3fff1ddee5348e0b1daa88c8f22b3125d3b68d77`.

Per-face Shell accepts four distinct original faces of one zero-draft rectangular extrusion when the two kept walls meet. Each kept wall has its own thickness. The kernel reuses the exact rectangular carve and validates the resulting two interior supports, original rims and closed oriented shell. The four source picks are ordered by their signed cardinal directions. The saved node keeps all six original signatures and adds an optional explicit fourth opening. Existing document versions can be read without conversion.

Opposite kept walls would create two disconnected plates. Model creation and native evaluation reject that request before accepting geometry with `SHELL_DISCONNECTED`. The existing uniform Shell, three-opening rebase and multi-result boundaries stay in their original scopes.

## Verification

- **PASS, native geometry.** All 12 adjacent kept pairs and all 24 opening orders agree with independent L-section volume, surface area and centroid. Translated stock, named support planes, strict B-rep, pcurves, directed tessellation edges, native Save/Open and refusal of all three opposite pairs pass. Vertical retained walls produce 8 faces, 18 edges and 12 vertices. A retained cap produces 10 faces, 22 edges and 14 vertices in world slabs. Collapse, missing prior openings, unknown or duplicated names and a thickness on an opened face refuse.
- **PASS, actual desktop Studio WebGPU.** The base shows the existing uniform Wall and has no Per face choice for the selected four faces. The final run picks Top, Bottom, Right and Back of the 40 × 30 × 20 mm stock. Preview and Cancel retain 24,000 mm³ before Apply. Left 3 mm and Front 4 mm give 4,760 mm³ and 3,276 mm². Front 30 mm refuses collapse. Front 8 mm gives 7,720 mm³. Undo/Redo and Save/fresh Open retain the authored fields and digest `27e665bef6984818629153d454ae051f8e9ca476b29e8c679609cf3f6f474a7a`. A second fresh document with opposite retained walls refuses with Apply disabled and retains the stock. The prior three-opening channel runs as a desktop control.
- **PASS, local Agent contract.** A revision-pinned command with four exact face names and both wall thicknesses produces the same node as the manual command. The opposite-wall case refuses without changing the source.
- **PASS, affected checks.** 69 Kernel tests, including the existing geometry and fixed digest checks, 19 Model and 49 Studio tests. Final four-opening kernel rerun, Kernel/Model/Studio types, scoped ESLint, production build and driver syntax pass. The final desktop driver freezes 1,283 files and reports zero writes, page and console errors.
- **Corrected first runs.** The Agent negative test initially included an unrelated wall value, which the existing schema refused first. The desktop negative reused a locator from before fresh Open. Type checks also caught a widened native axis, a generic Model refusal code and a missing test fixture annotation. The last Studio retry maps the typed Shell refusal to a specific title and corrective guidance. The final checks use the corresponding kept-wall inputs, current page and cardinal axis type.
- **NOT_RUN.** Four-opening stale proposal rebase, actual desktop runs for each remaining axis pair, arbitrary stock or fitted Shell, multiple output plates, full local suites and mobile. #13 stays open for broader Shell acceptance. The first mechanical CAD baseline remains 8/10. Overall CAD completion remains unmeasured.

```sh
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/{part-corner-shell-walls,part-shell-walls,part-adjacent-shell-walls,part-tube-shell-walls,part-opening-pair-shell-walls,part-model}.test.mjs
pnpm --dir packages/barocss-cad-model test shell-walls attached-rib corner-proposal-review
pnpm --dir apps/cad-studio test shell-opening opening-shell held-shell agent-tools
CORNER_OPEN_BOX_WALL_SHELL_FROZEN=1 node apps/cad-studio/test/corner-open-box-wall-shell-browser.mjs "$OUT/baseline" --four --baseline
CORNER_OPEN_BOX_WALL_SHELL_FROZEN=1 node apps/cad-studio/test/corner-open-box-wall-shell-browser.mjs "$OUT/delivery-final" --four
CORNER_OPEN_BOX_WALL_SHELL_FROZEN=1 node apps/cad-studio/test/corner-open-box-wall-shell-browser.mjs "$OUT/revised-channel" --channel
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
