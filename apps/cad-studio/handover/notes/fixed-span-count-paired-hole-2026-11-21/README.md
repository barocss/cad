# D1484 — Resize Count and Total span together with an active end Hole

P1, row 08, [#25](https://github.com/barocss/cad/issues/25). Base: `48ef20c3704416194cfe26ff1eec217e5723155a`.

Allow one History edit of Count and Total span for the existing plain rectangular fixed-span pattern with a single active terminal through Hole. The old and final pitches must keep stock copies separated. The complete bore must fit on both exact terminal copies. Update the same Hole's centre and numbered entry face together. The worker receives only the final document. The accepted source, draft owner and reply revision must match at commit time.

## Verification

- **FAIL, original combined edit.** On the actual desktop file, Count 3→4 and Total span 32→42 mm hit the old span-only guard. The document, solid, selection, History and Undo/Redo controls were preserved.
- **PASS, actual desktop Studio.** One Apply changes the pitch from 16 to 14 mm and moves Hole `n3` from [84, 13] and `n1.top@2` to [94, 13] and `n1.top@3`. Undo returns the exact original in one step. Redo, Save and fresh Open preserve the four copies and the same feature. Reversing both fields restores the original document, including the original face and centre, through a second fresh Open.
- **PASS, independent native geometry.** The strict native output has four pieces, a single cut top loop on copy 4 and two radius-1 cylinder walls centred at [94, 13]. Native and Worker volume are 742.8672587712799 mm³ and agree with `4 × 192 − 8π` within 1e-7 mm³. The independent centroid matches [72.28952641327088, 13, 4].
- **PASS, constrained controls.** The actual Count-only, Total span-only and existing distance-mode flows still pass. The actual combined case with Total span 12 and Count 4 refuses because the copies touch. Review, Cancel, Save and fresh Open preserve the original. The focused tests include equal pitch, a valid final layout with a touching intermediate layout, stale owner and mismatched reply revision, and a suppressed terminal Hole's existing refusal.
- **PASS, affected checks.** 19 focused Studio checks, scoped lint, Studio production build with typecheck, driver syntax and diff checks.
- **NOT_RUN.** Modern inputs with signatures or bound values, other pattern families, multiple Hole consumers, alternate desktop GPU backends, mobile, full local suites and Agent parity. #25 stays open.

Use Node 22.19.0 and the installed desktop Chrome and Playwright. Run heavy checks through the shared gate. Freeze worktree writes during browser runs and preserve evidence outside Git.

```sh
node --check apps/cad-studio/test/fixed-span-hole-spacing-browser.mjs
git diff --check
node apps/cad-studio/scripts/test.mjs fixed-span-hole-spacing fixed-span-suppressed-bore pattern-hole-signed-spacing circular-pivot-hole
pnpm exec eslint apps/cad-studio/src/{app/patternHoleSpacing,state/historyFeatureApply}.ts apps/cad-studio/test/fixed-span-hole-spacing.test.ts
pnpm --filter @barocss/cad-studio-app build
cd apps/cad-studio
export FIXED_SPAN_HOLE_SPACING_SOURCE_FROZEN=1
# Observe the original guard on the original runtime.
node test/fixed-span-hole-spacing-browser.mjs "$EVIDENCE/baseline" --combined --expect-refused
node test/fixed-span-hole-spacing-browser.mjs "$EVIDENCE/combined" --combined
node test/fixed-span-hole-spacing-browser.mjs "$EVIDENCE/span-controls"
D1020_SOURCE_FROZEN=1 node test/fixed-span-end-hole-browser.mjs "$EVIDENCE/count-only"
```
