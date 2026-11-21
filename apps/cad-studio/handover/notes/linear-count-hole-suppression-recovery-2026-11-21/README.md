# D1479 — Explain how to restore a Hole on a missing Linear Pattern copy

P1, row 08, [#25](https://github.com/barocss/cad/issues/25). Base: `f37241db281e502224c10b080e1f7a52d1dbf8e5`.

Author a through Hole by picking the top face of the third copy in Studio. Count 2 requires suppressing that Hole first. When a user tries to restore it on the two-copy part, the existing transaction refuses safely. The original notice only said the kernel could not build the feature and suggested Undo, including after the user reopened the saved file.

The notice now identifies the missing numbered copy for a failed Hole restoration on its active spacing-controlled Linear Pattern. It names the required Count, Pattern, Hole and saved entry face. The original kernel detail remains accessible.

## Verification

- **FAIL, original visible guidance.** Fresh Open of the two-copy part still refused restoration. The main hint gave no copy number or valid Count. The original feature was preserved and the missing face appeared in Details.
- **PASS, actual desktop Studio.** Pick `n1.top@2` and author Hole `n3` at [84, 13] mm. Count 2 with an active Hole gives the existing refusal. After suppressing the Hole, Count 2 applies. Undo and Redo preserve both recipes. Unsuppress is refused before and after fresh Open. The updated title names missing copy 3 and the hint tells the user to set Count to at least 3 on Pattern `n2`, then unsuppress Hole `n3`.
- **PASS, exact recovery.** The saved reduced part retains the authored Hole and its suppression, with 384.00000000000034 mm³ native volume and no bore walls. Increasing Count to 3 restores 576.0000000000005 mm³ before the Hole is restored. Unsuppress restores the exact authored document and the same face, center and radius. The native volume is 550.8672587712821 mm³, with two radius-1 wall faces on copy 3. It matches the independent stock and bore volume within 1e-7 mm³. Strict B-rep, original stock corners, Undo, Redo, Save and fresh Open all pass.
- **PASS, controls.** The signed-spacing desktop control passes on the starting runtime. The fixed-span suppression-order desktop flow passes after the notice change. 20 focused Studio checks, scoped lint, Studio production build with typecheck, driver syntax and diff checks pass.
- **NOT_RUN.** Built-in fixed-span Count recovery of a suppressed Hole, other pattern families, multi-consumer restoration, alternate desktop GPU backends, mobile and full local suites. #25 stays open.

Use Node 22.19.0 and the installed desktop Chrome and Playwright. Run heavy checks through the shared gate. Freeze worktree writes during browser runs and keep evidence outside Git.

```sh
node --check apps/cad-studio/test/linear-authored-hole-signed-browser.mjs
git diff --check
node apps/cad-studio/scripts/test.mjs pattern-hole-signed-spacing parameter-pattern-hole-spacing fixed-span-suppressed-bore fixed-span-hole-spacing
pnpm exec eslint apps/cad-studio/src/state/useFeatureHistory.ts
pnpm --filter @barocss/cad-studio-app build
cd apps/cad-studio
LINEAR_AUTHORED_HOLE_SIGNED_SOURCE_FROZEN=1 node test/linear-authored-hole-signed-browser.mjs "$EVIDENCE/count" --count-recovery
LINEAR_AUTHORED_HOLE_SIGNED_SOURCE_FROZEN=1 node test/linear-authored-hole-signed-browser.mjs "$EVIDENCE/signed-control"
D1022_SOURCE_FROZEN=1 node test/fixed-span-hole-suppression-browser.mjs "$EVIDENCE/suppression-control"
```
