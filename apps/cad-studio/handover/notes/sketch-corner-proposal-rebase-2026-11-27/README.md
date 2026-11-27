# D2066 — Rebase a reviewed Fillet proposal onto the current plate

P1 [row 04](../../roadmap-rows/04.md), [row 08](../../roadmap-rows/08.md) · [#324](https://github.com/barocss/cad/issues/324) · Base `4c70ea67e6b3fbdd87907ebdf0e57e6b35ea97d2`.

Local stdio MCP proposes an R4 Fillet on the original side pairs `e1/e2` and `e3/e4` of an 80 × 40 × 8 mm plate. Studio edits the thickness to 9 mm and saves. The original **Rebase & preview** button then replays the 8 mm revision pin and refuses to show the candidate.

On explicit user rebase, use the matching original Undo document to verify both the original model pin and the full evidence digest. Require the same authored sketch, parameter values, recorded feature order and sketch and Extrude owners. Replay the original targets with the current pin and verify the two exact native cylinder walls and their carrier seams. Keep P1 open and require user approval. If the original reviewed document is no longer available, the action keeps the stale proposal and directs the user to make a new one. A still-current operation pin takes the existing rebase path and retains any approval requirement already recorded.

## Verification

- **PASS, desktop rebase and approval.** The real Studio control regenerates P1 against the 9 mm plate. Its preview retains the accepted 28,800 mm³ solid and keeps the original side pairs. Undo restores the stale proposal. Redo restores the reviewed pending proposal. Only explicit Accept changes the part, with separate user-attributed rebase and acceptance entries. Undo/Redo of the acceptance restore the same compared documents. The original undo-less stale file refuses again after fresh Open and gives recovery guidance.
- **PASS, local stdio and geometry.** A new session on the rebased native file refuses the previous proposal pin and returns a new four-view PNG. The image and exact native inspection agree on the approval candidate. Its two cylinder centres are (76, 4) and (4, 36) mm, and both radii are 4 mm. Accepted and reopened strict solids have the same hash and volume, 28,738.194671058467 mm³, equal within tolerance to `9 * (80 * 40 - 2 * (16 - 4 * π))`.
- **PASS, Model boundary.** Rebase refuses a changed sketch even if the side tags are reused, a missing original snapshot and autonomous repinning. The follow-on rebase with a still-current operation pin retains its user approval requirement. The product keeps all native approval provenance in the existing proposal and history fields.
- **PASS, feature checks.** Model 15/15, Studio 17/17, both type checks, Studio production build, browser-driver syntax and diff check. Scoped ESLint reports one existing explicit-any warning in the proposals test. The final desktop run retains 1,256 source files through cleanup and reports zero page or console errors.
- **FAIL, baseline and initial type checks.** The prior Studio returns the stale feature-revision refusal. The first Model type check found an array method absent from the configured library target and one missing type import. The Studio harness lacked the Undo input. The final checks use the supported lookup and include the required test inputs.
- **NOT_RUN.** Automatic repinning of other proposal families, external agent clients, live model usage, full local suites and mobile. #324 stays open for its wider client and cost evaluation. First mechanical CAD remains 8/10 and overall CAD completion remains unmeasured.

The saved 9 mm base pin is `f4cd83ec8d5f8d83`. The candidate and accepted revision is `67e9a35806f3c04e`. The decoded MCP PNG SHA-256 is `e23e9f695d57fd1819aad73744b3327aba26d356426f3310656a779a4576434a`. The verified native body SHA-256 is `e878ac6e7beb49a317e950b11bdd05865b5ad1d32b287b8e3dca27ab9d994e31`.

```sh
# Use Node 22.19.0 and the existing desktop Chrome and Playwright. Gate one heavy run at a time.
D2066_SOURCE_FROZEN=1 node --import "$LOCAL_PLAYWRIGHT_PRELOAD" apps/cad-studio/test/sketch-corner-proposal-rebase-browser.mjs "$OUT/baseline" --baseline
D2066_SOURCE_FROZEN=1 node --import "$LOCAL_PLAYWRIGHT_PRELOAD" apps/cad-studio/test/sketch-corner-proposal-rebase-browser.mjs "$OUT/final"
pnpm --dir packages/barocss-cad-model test proposals rebase-moves-ops
pnpm --dir apps/cad-studio test proposal-review-availability toolset-mcp tool-contract-mcp
tsc --noEmit -p packages/barocss-cad-model
tsc --noEmit -p apps/cad-studio
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
git diff --check
```

Run the baseline command on the original product before the patch. Desktop receipt SHA-256 values are `1c21c61a210bb2be47a95a2990963cf91c381773290f14fae8ad008413219cb5` for the baseline and `d69f9694e8e18ed3e940cbaea251a69c2ff06f52e4e74aa03afdac05d24ff6d0` for the corrected flow.
