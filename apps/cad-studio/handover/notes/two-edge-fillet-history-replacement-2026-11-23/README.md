# D1717 — Replace one held edge in a saved two-edge Fillet

P0 reference ownership, rows 05, 15 and 16. [Issue #20](https://github.com/barocss/cad/issues/20). Base `b13b1c69c3d09e8150daaf136812889f98d3f9ef`.

Offer **Replace edge** in History for a terminal two-edge Constant Fillet with exactly one unresolved straight edge reference. The second reference must still name one unmerged native line with the same stored geometry. A deliberate canvas pick previews the new line. Apply changes only that reference and its signature after the rebuilt part passes. The source document, editor, problem list and mesh must still own the request. Keep the original candidate-list workflow and single-edge replacement available.

## Verification

- **FAIL, base direct History interaction.** The old two-edge feature shows one unresolved reference and six list candidates. The desired inner corner is Candidate 5 and works through References. History has no Replace edge action.
- **PASS, desktop Studio WebGPU.** Open the held Fillet, refuse a click on the retained line, then click the new inner line. The highlight uses the live edge. The accepted body, document and History remain unchanged before Apply and after Cancel. Apply, Undo to the exact held document, Redo, Save and fresh Open pass. The final run captures 11 checkpoints with zero source changes, console errors and page errors. The first browser attempt clicked before the camera settled. The rerun waits for four stable projection frames.
- **PASS, exact reference and geometry.** Apply produces the independently signed target document. It retains `n1.side0|n1.side1`, with midpoint [20, 0, 1.5] mm, length 3 mm and direction +Z. Only `n1.side1|n1.side2` and its stored signature are replaced with `n1.side2|n1.side3` and its current signature. The strict native solid has R2 cylinders at [18, 2] and [7, 7] mm with the expected contact points at Z0 and Z3. Native volume is 525 mm³. The added and removed volumes cancel, so verify both cylinder locations. The existing single-edge direct flow passes on the final source.
- **PASS, affected checks.** 20 Studio tests, scoped ESLint, Studio types and production build, browser driver syntax and Git diff check. Both authored slot orders pass. A stale retained signature, two problem references, a nonterminal feature and repeated candidate names are rejected in focused checks. The initial type check rejected the separate pair branch. The final type guards state their actual edge counts.
- **NOT_RUN.** Multi-edge Chamfer, curved or variable Fillet pairs, external instances, WebGL2, mobile, full local suites and live providers. The input is a supported file Open with altered upstream geometry. A live upstream sketch edit is not part of this verification. Issue #20 remains open. The first mechanical CAD milestone remains 8/10.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory.

```sh
TWO_EDGE_CONCAVE_REFERENCE_SOURCE_FROZEN=1 node apps/cad-studio/test/two-edge-concave-reference-browser.mjs "$OUT/base" --manual-base
TWO_EDGE_CONCAVE_REFERENCE_SOURCE_FROZEN=1 node apps/cad-studio/test/two-edge-concave-reference-browser.mjs "$OUT/verified" --manual
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test held-finish-replacement candidate-references reference-focus
pnpm exec eslint apps/cad-studio/src/App.tsx apps/cad-studio/src/state/{heldFinishReplacement,useHeldFinishEdge}.ts apps/cad-studio/test/{held-finish-replacement.test.ts,two-edge-concave-reference-browser.mjs}
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/two-edge-concave-reference-browser.mjs
git diff --check
```
