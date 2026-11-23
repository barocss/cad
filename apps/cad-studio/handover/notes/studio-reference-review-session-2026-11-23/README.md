# D1797 — Extract the Studio reference-review session from App

P4 Studio structure and reference usability, rows 15, 21 and 22. [Issue #44](https://github.com/barocss/cad/issues/44). Base `cea73c02bf338eb0c5b4c775ef071bf8f5505bb3`.

Move document-owned candidate choices, preview cancellation, Drawing label ownership and keyboard focus handoff into `useStudioReferenceReview`. Keep the existing reference decision and preview APIs. App retains the shared reference-problem WeakMap, document updates, evaluation, workspace transitions and JSX. App.tsx goes from 2,980 to 2,948 lines. The new hook has 91 lines. This is an ownership refactor, not a rendering or performance claim.

- **PASS, paired actual desktop Studio WebGPU.** The before/after runs match all 14 states and seven observations exactly. Candidate 1 and 2 select the same projected edges. Preview leaves the document, dirty flag and History unchanged. Model preview, explicit confirmation, Undo, Redo, Save and fresh Open retain the repaired endpoint. The saved Drawing document SHA-256 remains `5b926f402a986a37945b29381f0ec8b3a9d7167536d31945948dc64aa38109ca`.
- **PASS, stale and ambiguous reference controls.** Delayed Drawing projection, sheet changes, same-ID replacement documents, duplicate dimension IDs, hidden views and an already resolved marked dimension retain their original refusal or cancellation behavior. The exact accepted document and evaluated model still own label callbacks.
- **PASS, focus and native controls.** At desktop widths 1024 and 1440, keyboard confirmation moves focus to the next candidate or the durable Browser control after the final Model or Drawing reference. Mouse confirmation does not take focus. Model native volumes remain 8,995 mm³ and 9,000 − 10 × (1 − π/4) mm³. Both saved model files retain SHA-256 `43f1204a4aaa862efb2da1bd44c34f357ac1babf5c6dcd6f42974a1d0d2e70ce` and reopen without unresolved references.
- **PASS, affected checks.** All six desktop runs record 28 snapshots, unchanged source capsules and no page or console errors. All 15 affected Studio tests pass. Changed-file ESLint, final Studio type check and production build, browser-driver syntax checks and Git diff check pass.
- **FAIL, corrected first type check.** The first extraction left two old `setRefChoices` calls in project Open and the remembered-reference callback. The hook now provides a stable `clearReferenceChoices` action. Both callers retain their original execution timing, and the final type check, build and all three actual Studio flows pass. No candidate browser run used the incomplete extraction.
- **NOT_RUN.** Full local suites, other viewport backends, mobile, assistive-technology qualification and broader reference behavior. First mechanical CAD remains at 8/10 accepted. Overall completion remains unmeasured. Issue #44 stays open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright, and external output directories. Run all three browser commands before and after the extraction. The current harness pins the extracted hook in the candidate source capsule.

```sh
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test candidate-references reference-focus drawing-reference-candidate command-reference-picking
pnpm --dir apps/cad-studio exec eslint src/App.tsx src/app/useStudioReferenceReview.ts
pnpm --dir apps/cad-studio build
D757_SOURCE_FROZEN=1 node apps/cad-studio/test/drawing-reference-candidate-browser.mjs "$OUT/drawing"
D757_SOURCE_FROZEN=1 node apps/cad-studio/test/drawing-reference-candidate-browser.mjs "$OUT/guards" --guards
D1344_SOURCE_FROZEN=1 node apps/cad-studio/test/reference-final-focus-browser.mjs "$OUT/focus"
node --check apps/cad-studio/test/drawing-reference-candidate-browser.mjs
node --check apps/cad-studio/test/reference-final-focus-browser.mjs
git diff --check
```
