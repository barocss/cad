# D1483 — Extract Studio reference preview routing from App

P4, row 22. Base: `7529ffd36c5d382267af378c0a1a0e6fe6542f4e`.

Put preview routing alongside reference decisions. A drawing reference goes through the existing workspace switch and verifies its document owner before publishing. An explicit Model preview selects only a unique displayed edge. App supplies the workspace transitions, current selection and notices. App.tsx decreases from 3827 to 3813 lines.

## Verification

- **PASS, actual desktop Model and Drawing.** A lost endpoint exposes two candidates. Inspect the projected edge and its same native edge in Model. Preview preserves the accepted document and History. Explicit confirmation updates the chosen endpoint. A browser Project save and fresh Open preserve the repaired reference.
- **PASS, actual ownership controls.** A controlled delayed native projection cannot revive a preview after a sheet switch. Replacing the document removes the old overlay. Duplicate dimension IDs and hidden views refuse the preview. A resolved marked dimension can still be highlighted.
- **PASS, comparison.** Six ordinary and four guard checkpoints match before and after the extraction, including all captured states and five observations. Both final runs have zero page errors, console errors and source changes. Seven focused Studio tests, scoped lint, production build with typecheck, and diff checks pass.
- **FAIL, corrected initial candidate.** The first extraction read the assembly mate flag before App initialized it. The route now evaluates the Model guard on user action, as the original did. Both frozen desktop modes pass on the corrected runtime.
- **NOT_RUN.** Assistive technology, alternate desktop GPU backends, mobile and full local suites.

Use Node 22.19.0 and the installed desktop Chrome and Playwright. Run heavy checks through the shared gate. Freeze worktree writes during browser runs and preserve evidence outside Git.

```sh
git diff --check
node apps/cad-studio/scripts/test.mjs reference-focus drawing-reference-candidate
pnpm exec eslint apps/cad-studio/src/App.tsx apps/cad-studio/src/state/referenceDecisions.ts apps/cad-studio/src/ui/ReferenceDecisions.tsx
pnpm --filter @barocss/cad-studio-app build
cd apps/cad-studio
# Execute both drivers on the original runtime and again after the extraction.
D757_SOURCE_FROZEN=1 node test/drawing-reference-candidate-browser.mjs "$EVIDENCE/reference-preview"
D757_SOURCE_FROZEN=1 node test/drawing-reference-candidate-browser.mjs "$EVIDENCE/preview-guards" --guards
```
