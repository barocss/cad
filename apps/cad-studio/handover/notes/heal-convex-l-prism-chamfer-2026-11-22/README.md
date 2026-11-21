# D1596 — Heal the outside chamfer of an upright L bracket

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base `dd0830d3f0acd5277dd76e769ce14d5b55bc790a`.

Select one equal-distance outside chamfer that spans the height of an upright L-profile extrusion. Delete face restores the intersection of its two adjacent walls. The Kernel checks the original named edge, the exact planar bevel and its four native trims. The reconstructed six-wall section follows the same cardinal L proof as the outside fillet. Surviving surface and edge names remain stable. The rebuilt B-rep has new entity IDs.

- **FAIL, base native capability.** The prior Kernel produces the 2 mm outside chamfer at 3980 mm³ and returns `CAPABILITY` when Delete face targets its original bevel.
- **PASS, desktop Studio WebGPU.** Pick the native planar `n2.face` on the 20 mm upright extrusion, apply Delete face, Undo, Redo, Save and Open in a fresh context. Studio and the native inspector agree exactly at 3980 mm³ before and 4020 mm³ after. The repaired edge `n1.side0|n1.side1` joins (3, 0, 0) and (3, 0, 20) mm. The healed shell has 8 faces, 18 edges, 12 vertices and zero maximum edge-to-surface gap. Fresh Open gives the same full native digest.
- **PASS, independent sharp reference.** The original cardinal L section gives 4020 mm³ and the two equal 2 mm setbacks remove `20 × 2² / 2 = 40 mm³`. Native checks compare the recovered edges and centre of mass with the original sharp stock. They keep untouched edge coordinates and reject a 1e−9 mm unequal setback, altered support or trim, inside corners, non-L sections and multi-edge cases.
- **PASS, affected checks.** 59 Kernel, 15 Model and 49 Studio tests, Kernel and Model types, scoped lint, Studio build, browser syntax and Git diff. The passing desktop receipt records zero runtime errors, console errors and frozen source changes.
- **FAIL, initial Model message assertion corrected.** The broadened refusal text removed the existing chamfered-box wording. Restore that wording and name the added L scope. The final Model suite passes.
- **NOT_RUN.** Noncardinal L sections, a new stdio MCP run, other renderers, exchange, mobile and full local suites. #17 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Gate heavy checks and keep captures outside Git.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/{prismatic-fillet-heal,analytic-l-fillet-heal,bored-face-delete,prismatic-chamfer-heal}.test.mjs
pnpm --dir packages/barocss-cad-model test delete-chamfer-face delete-bore-face
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad/src/features/{cardinal-l-section,heal-prismatic-chamfer,heal-prismatic-fillet}.ts packages/barocss-cad/src/part/part-delete-face.ts packages/barocss-cad/test/{prismatic-chamfer-heal,prismatic-fillet-heal}.test.mjs packages/barocss-cad-model/src/app/deleteFaceCommand.ts packages/barocss-cad-model/src/engine/doc.ts packages/barocss-cad-model/test/delete-chamfer-face.test.ts apps/cad-studio/test/delete-fillet-face-browser.mjs
pnpm --dir apps/cad-studio test document-file command-apply viewport
pnpm --dir apps/cad-studio build
DELETE_FILLET_FACE_FROZEN=1 node apps/cad-studio/test/delete-fillet-face-browser.mjs "$EVIDENCE" --chamfer-l
node --check apps/cad-studio/test/delete-fillet-face-browser.mjs
git diff --check
```
