# D1486 — Preserve an Agent approval during a later manual fixed-span edit

P5, row 08 and Agent review, [#25](https://github.com/barocss/cad/issues/25). Base: `a34b3dce8796882efe8c75ae38c054bef12fafa0`.

Studio History now uses the same paired fixed-span proof as the local Agent. During the geometry proof, exclude only the proposal and decision records. Keep the actual document, both records, and the revision guards on the asynchronous evaluation reply. This applies when Count and Total span change together. Other edit paths retain their existing admission checks.

## Verification

- **FAIL, original Studio.** Fresh Open of the real D1485-approved file showed four copies at 42 mm. Editing Count to 3 and Total span to 32 mm in one Apply reported `Pattern span not changed`. Accepted document, evaluated bodies, selection, History and Undo/Redo stayed equal.
- **PASS, actual desktop Studio and strict native geometry.** The same edit restores three copies and moves the original Hole `n3` from X=94 mm and `n1.top@3` to X=84 mm and `n1.top@2`. The strict body has two radius-1 cylindrical walls and one circular opening in the last top face. Native and Worker volumes match `576 − 8π` mm³ within 1e-7 mm³. The native result reads 550.8672587712817 mm³. Undo restores 742.8672587712804 mm³, the previous pattern and the previous Hole reference.
- **PASS, evidence and file ownership.** One Undo and one Redo round-trip the complete documents. Save and fresh Open retain the exact proposal P1 and its original human decision and evidence revisions, while the geometry retains the manual change. The original approved input remains byte-identical.
- **PASS, affected checks.** 39 Studio tests, scoped lint, Model type-check, Studio production build, browser syntax and diff checks. A controlled late Worker reply is refused after the proposal decision ledger changes, even when the document object is the same.
- **NOT_RUN.** Arbitrary reference consumers, other edit classes, live providers, alternate GPU backends, mobile and full local suites. #25 stays open.

Use Node 22.19.0, installed Chrome and Playwright, and a D1485-approved file at 4 copies and 42 mm. Run heavy commands through the shared gate. Freeze worktree writes during browser runs and keep evidence outside Git.

```sh
node apps/cad-studio/scripts/test.mjs fixed-span-hole-spacing fixed-span-suppressed-bore circular-pivot-hole parameter-pattern-hole-spacing proposal-review-availability
node --check apps/cad-studio/test/fixed-span-hole-proposal-browser.mjs
pnpm exec eslint apps/cad-studio/src/state/historyFeatureApply.ts packages/barocss-cad-model/src/app/patternHoleSpacing.ts
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
git diff --check
cd apps/cad-studio
export FIXED_SPAN_HOLE_PROPOSAL_FROZEN=1
# Use --expect-manual-refusal on the original runtime.
node test/fixed-span-hole-proposal-browser.mjs "$EVIDENCE/original" --manual-after "$APPROVED" --expect-manual-refusal
node test/fixed-span-hole-proposal-browser.mjs "$EVIDENCE/qualified" --manual-after "$APPROVED"
```
