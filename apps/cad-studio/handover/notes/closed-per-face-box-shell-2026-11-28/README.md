# D2138 — Create a closed rectangular Shell with six wall thicknesses

P5 [row 07](../../roadmap-rows/07.md), [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md) · [#13](https://github.com/barocss/cad/issues/13) · Base `41f4d1c97141fd1b7033b03d298d7ff8d5137312`.

Select a whole original upright zero-draft rectangular extrusion, run Shell and choose Per face. The command stores `opening: null`, one thickness per original plane and all six native face signatures. The original one- and two-opening files retain their string openings. Closed features require explicit null; a missing opening or a null opening with a second opening fails. The file schema version stays the same. Earlier readers refuse the new closed form.

The exact native result keeps the original six planes and subtracts a named rectangular cavity. Its six inward faces have the original names under the new Shell's interior prefix. The producer verifies both closed shells, exact supports, topology and pcurves. Uniform and open Shells continue to use their existing paths. An edit that collapses a cavity leaves the prior result and history intact.

## Verification

- **PASS, baseline.** Selecting the 40 × 30 × 20 mm box in Chrome Desktop offers one uniform Wall field. Cancel preserves the 24,000 mm³ stock.
- **PASS, candidate.** Studio previews the six independent fields, cancels without changing the document and applies on the second preview. Left/right/front/back/bottom/top are 3/5/2/4/2/3 mm. The independent cuboid calculations give a 32 × 24 × 15 mm cavity, 12,480 mm³ remaining volume and 8,416 mm² total surface area. Native and Studio match. The strict solid has two shells, 12 faces, 12 loops, 48 coedges, 24 edges, 16 vertices and genus zero. The six original plane positions and six opposite interior planes match all authored thicknesses.
- **PASS, recovery and persistence.** A 37 mm right wall would collapse the cavity with the 3 mm left wall. Studio refuses it and retains the accepted document and history. Editing to 7 mm gives 13,200 mm³ and 8,260 mm². Undo, Redo, native Save and fresh Open retain the exact accepted state. Live Section at Y15 mm shows the reopened cavity. Both browser runs freeze 1,280 sources with zero changes, page errors or console errors.
- **PASS, affected checks and audit.** 97 Kernel, 32 Model and 31 Studio tests. Types, scoped lint, driver syntax, diff check and production build pass on Node 22.19.0. Independent review verifies source admission, exact supports, compatibility and consumer scope. A mutation that moves the right inside plane by 1 mm fails the area comparison with 8,338 mm² instead of 8,416 mm².
- **FAIL, corrected setup.** The first baseline used the palette shortcut while focus was in the body tree. The final driver clicks Shell on the Model rail. The first native control expected a later refusal for draft; the original upright-box guard rejects it earlier.
- **NOT_RUN.** Local Agent approval of this closed mode, external formats, freeform shells, full local suites and mobile. #13 remains open for the wider native Shell acceptance. First mechanical CAD remains 8/10 accepted. Overall completion is unmeasured.

```sh
# Node 22.19.0. Run each actual desktop flow under the heavy gate.
CLOSED_BOX_WALL_SHELL_FROZEN=1 node apps/cad-studio/test/closed-box-wall-shell-browser.mjs "$OUT/baseline-retry" --baseline
node packages/barocss-cad/scripts/tool.mjs build:fast
CLOSED_BOX_WALL_SHELL_FROZEN=1 node apps/cad-studio/test/closed-box-wall-shell-browser.mjs "$OUT/candidate"
node --test --test-concurrency=1 packages/barocss-cad/test/{box-shell,part-shell-walls,part-tube-shell-walls,part-adjacent-shell-walls,part-opening-pair-shell-walls,part-closed-l-shell-join,part-model,api-part}.test.mjs
pnpm --dir packages/barocss-cad-model test shell-walls shell-opening-history attached-rib editable-step
pnpm --dir apps/cad-studio test shell-opening-history closed-l-shell shell-thickness
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
