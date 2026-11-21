# D1485 — Share the fixed-span end Hole proof with local Agent review

P5, row 08 and agent review, [#25](https://github.com/barocss/cad/issues/25). Base: `d89b2c6f26b5d548718c59223d5e819513c827e9`.

Move the existing linear-pattern proof to Model and reuse it from the local Agent edit path for combined Count and Total span edits. Keep proposal and decision records in the accepted document, while evaluating their geometry separately from those records. Link the two changed features in proposal selection so either both changes are reviewed or both are excluded.

## Verification

- **FAIL, original Agent parity.** A real level-1 MCP proposal for 4 copies over 42 mm refused because the Hole was still at X=84 mm. The original near case, 4 copies over 32.5 mm, produced a proposal that listed only the Pattern. Actual Studio approval and fresh Open showed that it kept X=84 mm and face `n1.top@2` even though the visible bore was cut on copy 4.
- **PASS, exact revision and safe proposals.** On the same revision, direct level-1 edit refuses and leaves the source unchanged. Touching copies and a stale revision also refuse. Both valid proposals display Pattern `n2` and Hole `n3` and predict +192 mm³. The stored proposal has no applied geometry.
- **PASS, actual desktop preview and approval.** Preview leaves the accepted model unchanged. Excluding Hole `n3` excludes both features, and including it restores both before approval. Studio records one user decision. The near case moves the bore to X=84.5 mm. The large case moves it to X=94 mm. Both retain Hole `n3` and its new entry face `n1.top@3`.
- **PASS, native and file.** Strict native geometry has four stock pieces, one cut on the last top face, two radius-1 walls and the expected analytic volume `768 − 8π` mm³. Native and Worker views agree within 1e-7 mm³. Undo, Redo, Save and fresh Open preserve exact documents. The pending input file stays unchanged.
- **PASS, controls.** Actual manual combined History, 25 Model and 33 Studio checks, scoped lint, Model typecheck, Studio production build, browser syntax and diff checks pass. The first browser assertion read the controlled checkbox before preview evaluation completed. The final run waits for the resulting public state and verifies both selections.
- **NOT_RUN.** Live providers, the other autonomy levels, arbitrary or multiple dependent Holes, manual edits after a recorded Agent approval, alternate desktop GPU backends, mobile and full local suites. #25 stays open.

Use Node 22.19.0 and the installed desktop Chrome and Playwright. Run heavy checks through the shared gate. Freeze worktree writes during browser runs and preserve evidence outside Git.

```sh
node --check apps/cad-studio/test/fixed-span-hole-proposal-browser.mjs
git diff --check
node packages/barocss-cad-model/scripts/test.mjs proposals revision-pinned-command toolset
node apps/cad-studio/scripts/test.mjs fixed-span-hole-spacing fixed-span-suppressed-bore circular-pivot-hole toolset-mcp proposal-review-availability
pnpm exec eslint apps/cad-studio/src/{app/patternHoleSpacing,state/historyFeatureApply}.ts packages/barocss-cad-model/src/{app/patternHoleSpacing,chat/part/features,chat/part/proposals}.ts
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
cd apps/cad-studio
export FIXED_SPAN_HOLE_PROPOSAL_FROZEN=1
# Use --baseline on the original runtime to observe the incorrect near-case approval.
node test/fixed-span-hole-proposal-browser.mjs "$EVIDENCE/original" --baseline
node test/fixed-span-hole-proposal-browser.mjs "$EVIDENCE/large"
node test/fixed-span-hole-proposal-browser.mjs "$EVIDENCE/near" --near
FIXED_SPAN_HOLE_SPACING_SOURCE_FROZEN=1 node test/fixed-span-hole-spacing-browser.mjs "$EVIDENCE/manual" --combined
```
