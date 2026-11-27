# D2051 — Recover two held Fillet edges beside an independent box

P1 [row 15](../../roadmap-rows/15.md) and [row 16](../../roadmap-rows/16.md). [#20](https://github.com/barocss/cad/issues/20). Public base `1324d3c69d5d359a4609521714bc0b25cacc63bc`.

Allow History edge replacement for a held two-edge constant Fillet on a literal rectangular Extrude when the same document contains one later, independent rectangular Extrude. Admit only the original missing line slots and the two distinct current native solid outputs. Match picks on the Fillet's own body. Rebuild the whole document and verify the companion producer and six unchanged unmerged native rectangular faces before committing. The comparison checks the unrounded axis-plane positions, outward signs, normals, face areas and centroids.

- **FAIL, previous desktop Studio.** Both original edges stay held and the two solids open correctly. History has no Replace edges action for the Fillet.
- **PASS, fixed desktop Chrome/WebGPU.** Normal selection confirms the test point hits the companion edge. History refuses that edge and a duplicate Fillet edge. Both valid Fillet picks are staged without changing either body, the document or Undo/Redo. Cancel preserves both held references. Apply replaces the two slots in one history step. Undo restores the held state. Redo, native Save and fresh Open retain both solids and the chosen references.
- **PASS, independent native geometry.** The main body goes from 32,000 to `32,000 − 20(4 − π)` mm³, or 31,982.8318530718 mm³. Strict native inspection verifies the two R2 cylinders on the original opposite corners. The companion is 500 mm³, with all eight expected corners and centre (91, −37, 2.5) mm. Its full native B-rep matches before, after, on Undo and after fresh Open. The saved file SHA-256 is `814564531a3897935799f6265a2ff68c7b19ef9302233f7781ffb22d75c2e3e0`.
- **PASS, retained workflows.** The actual desktop paired Fillet before an independent Through Hole and the mixed-companion Draft control both pass. The browser receipts show no console errors and no frozen-source changes. Focused checks cover wrong producers, duplicate picks, dependent or nonrectangular companions, and differences in an exact plane below signature quantization.
- **PASS, affected checks.** 37 focused Studio tests, scoped ESLint, Studio types with CI-pinned TypeScript 5.9.2 and Studio production build.
- **NOT_RUN.** Multiple companions in this Fillet route, other new finish families, local Agent inspection for this new route, and full local suites. #20 stays open. First mechanical CAD is 8/10. Overall CAD is unmeasured.

```sh
# On the previous SHA with the extended driver:
D2051_SOURCE_FROZEN=1 node apps/cad-studio/test/held-paired-fillet-group-through-hole-browser.mjs "$OUT/prior" --companion --baseline
D2051_SOURCE_FROZEN=1 node apps/cad-studio/test/held-paired-fillet-group-through-hole-browser.mjs "$OUT/fixed" --companion
D1987_SOURCE_FROZEN=1 node apps/cad-studio/test/held-paired-fillet-group-through-hole-browser.mjs "$OUT/hole-control"
D2037_SOURCE_FROZEN=1 node apps/cad-studio/test/held-draft-companion-browser.mjs "$OUT/draft-control" --mixed
pnpm --dir apps/cad-studio test held-fillet-box-companion held-finish-replacement held-draft-face-replacement drawing-notice-lifecycle
node "$TSC_592" --noEmit -p apps/cad-studio/tsconfig.json
pnpm --dir apps/cad-studio build
git diff --check
```
