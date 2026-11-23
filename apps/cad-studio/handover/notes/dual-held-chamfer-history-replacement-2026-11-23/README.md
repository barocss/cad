# D1768 — Replace both held edges of one saved Chamfer

P0 reference ownership, rows 05, 15 and 16. [Issue #20](https://github.com/barocss/cad/issues/20). Base `61ad90da7611819f216953a1780bad3a169e6a3c`.

Use the two-slot History review for a terminal Chamfer with a single positive distance and two held straight references. Keep each authored slot until both distinct native lines are selected. Apply after the current source rebuild succeeds. A duplicate-pick notice belongs to the active review and clears after a valid pick or Cancel.

- **FAIL, original interaction.** Actual Studio opens the changed L with both references held. The History editor offers no two-edge replacement.
- **FAIL, recovered notice.** The first candidate displayed a duplicate-pick notice after Cancel, a valid second pick and Apply. The final Studio run verifies that the notice clears on Cancel and on a valid pick.
- **PASS, actual desktop Studio WebGPU.** Select the inner line, refuse the duplicate and keep Apply disabled until both slots contain distinct native lines. Cancel retains both original references and History. Stage both replacements with the accepted document and body intact. One Apply writes both current signatures. Undo restores both held problems. Redo, Save and fresh Open restore the accepted Chamfer.
- **PASS, native identity.** The 3 mm solid retains a 2 mm Chamfer on the concave and convex lines. The new signatures are centered at `[5,5,1.5]` and `[20,0,1.5]` mm. The second alias previously referred to `[20,−12,1.5]`. Both sets of bevel contacts and planes match the independently built target. The native volume is 525 mm³. Unit checks also preserve a bound Chamfer distance and refuse unresolved parameters or nonterminal pairs.
- **PASS, affected checks.** 22 Studio tests, scoped ESLint, Studio production build and types, driver syntax and Git diff check. Three final desktop runs record 20 checkpoints with zero page, console or source errors. The D1722 Fillet control reproduces three native records and its saved document byte for byte.
- **NOT_RUN.** Three or more references, general curved or variable pairs, arbitrary Chamfer families, alternate GPU backends, mobile, full local suites and live providers. Issue #20 stays open. First mechanical CAD remains 8/10. Whole-product completion is unmeasured.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external evidence directories. Run the first desktop command on the base with the candidate driver.

```sh
D1768_SOURCE_FROZEN=1 node apps/cad-studio/test/two-edge-concave-reference-browser.mjs "$OUT/base" --chamfer --dual-base
D1768_SOURCE_FROZEN=1 node apps/cad-studio/test/two-edge-concave-reference-browser.mjs "$OUT/chamfer" --chamfer --dual-manual
TWO_EDGE_CONCAVE_REFERENCE_SOURCE_FROZEN=1 node apps/cad-studio/test/two-edge-concave-reference-browser.mjs "$OUT/fillet" --dual-manual
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test held-finish-replacement candidate-references reference-focus
pnpm exec eslint apps/cad-studio/src/{state/heldFinishReplacement.ts,state/useHeldFinishEdge.ts,ui/NodeEditor.tsx}   apps/cad-studio/test/{held-finish-replacement.test.ts,two-edge-concave-reference-browser.mjs}
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/two-edge-concave-reference-browser.mjs
git diff --check
```
