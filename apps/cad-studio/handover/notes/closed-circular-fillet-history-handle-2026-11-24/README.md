# D1865 — Anchor a saved closed-rim Fillet to the original seam

P4/P5 [row 08](../../roadmap-rows/08.md), [row 16](../../roadmap-rows/16.md) and [row 20](../../roadmap-rows/20.md), [#214](https://github.com/barocss/cad/issues/214). Base `4064c2abc8a91a32619bd1de114ec3de7b514fb1`.

History can now use the original native seam on an ordinary terminal Constant Fillet of the complete upper rim. The original read has to resolve both saved names to the same certified display rim and exactly reproduce both shared signatures. The accepted output has to prove both complementary toroidal half charts, complete rational trim coefficients and the reciprocal seams to the other half, original cap and cylinder. This proof remains runtime metadata and is removed on placement. A reused stock B-rep can carry the kernel cache ID `target`. The original cap and wall retain their authored names, which now bind the evidence. The existing worker and document ownership checks protect the new frame. Existing open-rim and separate-pair proofs remain distinct.

- **FAIL, original Studio History alignment.** Fresh Open retained the original R0.6 solid and both native source names. The idle History grip was 284.642747 CSS px from the independent +X seam position. Typed R1.5 still produced a strict valid solid.
- **PASS, fixed actual desktop Studio.** Top error is 0.000047080 CSS px. The end-on view has 0.000022710 CSS px anchor error and 0.000002212 CSS px projected guide travel. The closed-rim flow records eight states. The ordinary open-quarter History control records six states. A held original-source response disables the grip. Releasing the response while the old pointer is pressed does not start a drag. A subsequent end-on drag previews R1.5 from R0.6. Cancel retains the saved geometry. Apply, Undo/Redo, a fresh typed edit and native Save/open give the same strict result. A delayed response released after opening another part cannot replace its current state or restore the old grip.
- **PASS, independent geometry.** Both original cap rim names stay in the feature. The final solid has six native faces, ten edges and six vertices. Both accepted half charts match the independent circular meridional sections. At R1.5 the independent volume is 1987.364903628 mm³. Drag, numeric edit and fresh Open share digest `e89e3ffe2b8df908d0cc755ecf64e20405f965ee3eb2b7bcd85704e99942f6c0`.
- **PASS, affected checks.** 10 Model tests, 30 Studio tests, scoped lint, Model type check and Studio production build. The closed-rim Model proof refuses substituted targets, retained faces, trim poles and torus weights. Studio checks stale owner, replaced original source and altered saved signature. Both browser routes use the same scoped test harness for the delayed real worker reply.
- **FAIL, first affected attempts.** The first native test missed raw orientation in reverse target order. The first receipt expected a face-member list used by another representation. The first Studio trial exposed the real consumed-stock cache ID. The first browser recheck completed native drag and file parity but queried a locator held from a prior browser context. The final checks include the recorded cache regression and resolve the late reply in the current context.
- **NOT_RUN.** Full local suites, other closed rims, arbitrary curved History chains, other renderers, mobile and paid providers. The wider #214 remains open. First mechanical CAD stays 8/10. Whole-product completion remains unmeasured.

## Reproduce the qualified checks

Run the desktop flows one at a time with the existing local Chrome and Playwright installation. Use separate output directories and freeze the worktree during each run.

```sh
pnpm --dir packages/barocss-cad-model test native-fillet-torus-pair circular-fillet-handle
pnpm --dir apps/cad-studio test history-fillet-radius-receipt scalar-handle-drag command-build-failure
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
D1865_SOURCE_FROZEN=1 node apps/cad-studio/test/closed-circular-fillet-handle-browser.mjs "$OUT/closed" --history
CIRCULAR_FILLET_HANDLE_FROZEN=1 node apps/cad-studio/test/circular-fillet-radius-handle-browser.mjs "$OUT/quarter" --history
```
