# D1594 — Heal the outside fillet of an upright L bracket

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base `07ce11d791a25efe98c07703904e387a9da4618f`.

Select one constant circular fillet that spans the height of an upright L-profile extrusion. Delete face restores the intersection of its two adjacent walls. The kernel proves the full-height outward quarter-cylinder, its setback and the six-edge cardinal L after reconstruction. The original Fillet remains in History. The surviving face and edge names remain stable, and the rebuilt B-rep has new entity IDs.

- **FAIL, base native capability.** The existing Kernel produces the selected outward R2 cylinder on the L fixture and refuses Delete face with `CAPABILITY`.
- **PASS, desktop Studio WebGPU.** Pick `n2.face` on the outside corner of a 20 mm upright extrusion of the 40 × 30 mm L section. Apply Delete face, Undo, Redo, Save and fresh Open. The healed body has 8 faces, 18 edges, 12 vertices and a zero maximum edge-to-surface gap. It restores `n1.side0|n1.side1` between (3, 0, 0) and (3, 0, 20) mm. Native and Studio volumes are exactly 4020 mm³. Fresh Open gives the same complete native digest.
- **PASS, independent sharp reference.** The sharp stock and restored bracket volume equal `(40 × 3 + 30 × 3 − 3 × 3) × 20 = 4020 mm³`. The rounded volume agrees with `4020 − 20(4 − π)`. Kernel tests compare both L orientations, the original sharp edges, the independent centre of mass and the untouched edge geometry. They keep the non-L and stale-signature refusals. Existing concave L and rectangular stock heals pass.
- **PASS, affected checks.** 55 Kernel, 8 Model and 49 Studio tests, Kernel and Model types, scoped lint, Studio build, browser syntax and Git diff. The desktop run records zero runtime errors, console errors and frozen source changes.
- **NOT_RUN.** Noncardinal or multiple rounds, broader topology changes, a new MCP run, other renderers, neutral exchange, mobile and full local suites. #17 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Gate heavy checks and keep captures outside Git.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/{prismatic-fillet-heal,analytic-l-fillet-heal,bored-face-delete,prismatic-chamfer-heal}.test.mjs
pnpm --dir packages/barocss-cad-model test delete-bore-face
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad/src/features/heal-prismatic-fillet.ts packages/barocss-cad/src/part/part-delete-face.ts packages/barocss-cad/test/prismatic-fillet-heal.test.mjs packages/barocss-cad-model/src/app/deleteFaceCommand.ts apps/cad-studio/test/delete-fillet-face-browser.mjs
pnpm --dir apps/cad-studio test document-file command-apply viewport
pnpm --dir apps/cad-studio build
DELETE_FILLET_FACE_FROZEN=1 node apps/cad-studio/test/delete-fillet-face-browser.mjs "$EVIDENCE" --convex-l
node --check apps/cad-studio/test/delete-fillet-face-browser.mjs
git diff --check
```
