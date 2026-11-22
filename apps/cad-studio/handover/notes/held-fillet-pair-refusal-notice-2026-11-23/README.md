# D1735 — Retire a held Fillet replacement failure when its picks change

P0, rows 05, 15 and 16. [Issue #20](https://github.com/barocss/cad/issues/20). Base `e0b946a9c7fc185fb4af5a48ee3b2a16ca59c78a`. Extends the [D1722 two-edge review](../dual-held-fillet-history-replacement-2026-11-23/README.md).

Studio keeps the two staged picks and original held feature when native evaluation refuses Apply. The review owns that failure notice. A changed pick, Cancel, successful Apply or exit from the source scope retires the exact notice. A newer or unrelated notice remains independent. The shared App notice retirement already checks object identity.

- **FAIL, base desktop Chrome / WebGPU.** Both admissible straight picks reach native evaluation on a 1 mm L-shaped extrusion. The R2 Fillet refuses the upper front edge with `RADIUS_EXCEEDS_FACE`: it meets walls of 1 and 5 mm. Both held references, the chosen edges, raw document, evaluated body, selection and history survive. The failure notice persists after a different pick and after a valid Apply.
- **PASS, desktop Chrome / WebGPU.** The same native refusal leaves both picks available. Replace only the second choice with the outside upright. The old alert clears before Apply. Apply resolves both references in one action. Undo restores the two held choices. Refuse again, Cancel, then Redo the successful action. Save and fresh Open preserve the exact authored document. The full pair and one-held controls pass. All three final browser runs report zero source changes.
- **PASS, independent native checks.** The originally signed body, rejected candidate and explicit valid candidate are evaluated outside the browser. The reopened solid passes strict B-rep checks. It has two exact R2 cylinders with verified tangency vertices at both cap levels and an analytic volume of 175 mm³. The individual convex and concave volume changes cancel, so the cylinder and contact checks distinguish the accepted result from the held body.
- **PASS, affected checks.** 25 focused Studio tests, scoped ESLint, Studio type check and production build, browser driver syntax and Git diff check.
- **NOT_RUN.** Higher-arity replacements, curved or variable Fillet pairs, paired Chamfer, injected late replies, WebGL2, mobile, full local suites, and live providers. First mechanical CAD remains 8/10. Overall completion remains unmeasured. Issue #20 remains open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory.

```sh
TWO_EDGE_CONCAVE_REFERENCE_SOURCE_FROZEN=1 node apps/cad-studio/test/two-edge-concave-reference-browser.mjs "$OUT/base" --dual-native-refusal --expect-stale-notice
TWO_EDGE_CONCAVE_REFERENCE_SOURCE_FROZEN=1 node apps/cad-studio/test/two-edge-concave-reference-browser.mjs "$OUT/verified" --dual-native-refusal
TWO_EDGE_CONCAVE_REFERENCE_SOURCE_FROZEN=1 node apps/cad-studio/test/two-edge-concave-reference-browser.mjs "$OUT/control-pair" --dual-manual
TWO_EDGE_CONCAVE_REFERENCE_SOURCE_FROZEN=1 node apps/cad-studio/test/two-edge-concave-reference-browser.mjs "$OUT/control-single" --manual
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test held-finish-replacement candidate-references reference-focus
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test drawing-notice-lifecycle
pnpm exec eslint apps/cad-studio/src/App.tsx apps/cad-studio/src/state/useHeldFinishEdge.ts apps/cad-studio/test/two-edge-concave-reference-browser.mjs
node --check apps/cad-studio/test/two-edge-concave-reference-browser.mjs
pnpm --dir apps/cad-studio build
git diff --check
```
