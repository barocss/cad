# D2057 — Pattern one rounded rectangular boss onto its original plate

P1 [row 7](../../roadmap-rows/07.md) and [row 8](../../roadmap-rows/08.md) · FEATURE · [#761](https://github.com/barocss/cad/issues/761). Product base `bce150dd8781c404ad80dcdbcad616e934c6fba7`.

- **PASS, desktop Chrome/WebGPU.** Create a 100 × 50 × 5 mm Box from New part. Sketch one 10 × 8 mm rectangle on its upper face at X10 and Y12. Use New body for the 6 mm seed Extrude. Pick its four upper edges and apply a constant R1 Fillet. Select that seed and choose Linear pattern, Result, Join to plate, X, Spacing 25 and Count 3. Cancel the first preview and apply the second. The original plate and the seed remain editable in History. The existing Sketch pattern control does not offer rectangular repetition.
- **PASS, edits and atomic refusal.** Change the original X to 12, width to 12, height to 8 and radius to 2 in separate History steps. The pitch, count, four original Fillet names and both original plate features stay fixed. Undo preserves the R1 result. Outside X40, spacing 11, radius 20 and source Fillet suppression are refused with the accepted document and Undo/Redo availability intact. Redo restores R2. Model also refuses an original missing rim with no replacement candidates.
- **PASS, native Save and fresh Open.** The saved document equals the accepted document. The result in a fresh desktop context has the same document and native record, including all vertex positions, cylinders and exact volume. There is one strict solid and one genus-zero shell with 33 faces, 84 edges and 56 vertices. For `W`, `D`, `H` and `R` in mm, the independent volume in mm³ is `25000 + 3[HWD − 2(W + D)(1 − π/4)R² + 4(5/3 − π/2)R³]`. Initial, shifted, widened, taller and R2 are 26,417.973445725383, 26,417.973445725383, 26,703.398223686152, 27,279.398223686152 and 27,210.19467105846 mm³. All five match separately constructed native boss-and-Union references within 10⁻⁸ mm³. The twelve native cylinders have the expected axes, stations, radii and outward orientation.
- **FAIL, reproduced before the fix.** A generic Linear pattern plus Union accepted the last boss 2 mm outside the plate. The initial joined implementation saved correct bytes but refused Open on the old positional Fillet signatures after a seed edit. The validated joined rectangle keeps its four authored upper rim roles. Open checks each saved name against one live native line on the original Extrude and refuses a missing name. The optional join marker uses the existing schema and native operations.
- **PASS, affected checks.** Model 84 checks cover the local Agent command, legacy circular and linear patterns, native comparison and signed-reference admission. Studio 54 checks, pinned TypeScript 5.9.2, scoped ESLint, browser syntax and diff checks pass. Body pattern commands moved out of `commands.ts`, which decreased from 1,244 to 1,128 lines. The Studio production build passes.
- **NOT_RUN.** Full local suites, mobile, external CAD, arbitrary additive profiles and live Agent providers. First mechanical CAD remains 8/10. Overall CAD remains unmeasured.

```sh
D2057_SOURCE_FROZEN=1 node apps/cad-studio/test/joined-boss-pattern-browser.mjs "$OUT/final"
pnpm --dir packages/barocss-cad-model test joined-boss-pattern linear-span-pattern circular-pattern references
pnpm --dir apps/cad-studio test history-feature-editor history-feature-apply body-selection-query browser-selection-reveal
node "$TSC_592" --noEmit -p packages/barocss-cad-model
node "$TSC_592" --noEmit -p apps/cad-studio/tsconfig.json
pnpm --dir apps/cad-studio build
git diff --check
```

The captured baseline used the same seed chain and the generic Union result. Desktop receipt SHA-256 is `bb190c8084bd14b224d24a103edaf2f3a6927dee1a94a6fb22d9df7b0c9ac91e` for the original outside case, `53a844baa5e50dac26cfadb41050ca62b1feb8d822fa3a9d246d16bc90dec3c9` for the pre-fix Open refusal and `e971625ac0d05daf62cff0de012a2703f611af964970e4dc6310a489186a02be` for the passing run. Both writes before and after the Open fix have the same file SHA-256, `646b50edfeb3e2195aff0d37b46a8b59f27f05e7d2b0220237a06825c7277fd3`.
