# D1722 — Replace both held edges of one saved Constant Fillet

P0 reference ownership, rows 05, 15 and 16. [Issue #20](https://github.com/barocss/cad/issues/20). Base `0f3b7faa1bc6cf87b4ca9326f9bbae2207d2b55d`.

Offer **Replace edges** in History for a terminal Constant Fillet with two unresolved straight references. Show each authored slot and require two different unmerged native lines from the same live passthrough mesh. Both picks stay in one review until Apply. Commit both names and both current signatures in authored slot order after a successful full part rebuild. Remove exactly those two reference problems. Each press belongs to the original document, editor, evaluated mesh and Open scope.

## Verification

- **FAIL, base interaction.** Desktop Studio opens the changed L with two unresolved references and a held Fillet. History has no direct two-slot replacement.
- **PASS, desktop Studio WebGPU.** Pick the concave line, refuse using the same line twice and verify disabled Apply until both slots have a choice. Cancel preserves both held references. A second attempt picks the original convex alias as the other line and stages both without changing the accepted document, body or History. One Apply changes both references. Undo restores both held problems, Redo restores the exact result, and Save and fresh Open pass. The 8 checkpoints have zero source changes, console errors or page errors.
- **PASS, exact reference and native geometry.** The original 3 mm solid has convex R2 carriers at [18,18] and [18,−10] mm, with volume `1770 − 6(4 − π) mm³`. The accepted 525 mm³ solid has R2 cylinders at [18,2] and [7,7] mm. The accepted document matches the independent target, including source nodes, feature identity, radius and outputs. The saved alias `n1.side0|n1.side1` receives the new midpoint [20,0,1.5] mm in place of [20,−12,1.5] mm.
- **PASS, affected checks.** 21 Studio tests, scoped ESLint, Studio types and production build, browser driver syntax and Git diff check. The unit case accepts crossed historical aliases in one transaction. The D1717 one-held and existing single-edge desktop flows remain successful.
- **FAIL, initial browser verification.** The Undo test counted nested accessibility groups as reference rows. The final test checks the two actual held notices. The initial type check also required a concrete list of picked edges for viewport presentation.
- **NOT_RUN.** Three or more references, curved or variable Fillet pairs, paired Chamfer, injected late replies, a failing native rebuild after two admissible picks, WebGL2, mobile, full local suites and live providers. The first mechanical CAD milestone remains 8/10. Issue #20 remains open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory.

```sh
TWO_EDGE_CONCAVE_REFERENCE_SOURCE_FROZEN=1 node apps/cad-studio/test/two-edge-concave-reference-browser.mjs "$OUT/base" --dual-base
TWO_EDGE_CONCAVE_REFERENCE_SOURCE_FROZEN=1 node apps/cad-studio/test/two-edge-concave-reference-browser.mjs "$OUT/verified" --dual-manual
TWO_EDGE_CONCAVE_REFERENCE_SOURCE_FROZEN=1 node apps/cad-studio/test/two-edge-concave-reference-browser.mjs "$OUT/control" --manual
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test held-finish-replacement candidate-references reference-focus
pnpm exec eslint apps/cad-studio/src/App.tsx apps/cad-studio/src/state/{heldFinishReplacement,useHeldFinishEdge}.ts apps/cad-studio/src/ui/NodeEditor.tsx apps/cad-studio/src/viewport/useViewportSelectionPresentation.ts apps/cad-studio/test/{held-finish-replacement.test.ts,two-edge-concave-reference-browser.mjs}
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/two-edge-concave-reference-browser.mjs
git diff --check
```
