# D1482 — Extract Studio Browser reference decisions from App

P4, row 22. Base: `2d6f63948b02adcd919d61f4e3757a62fc171ac6`.

Move alternative discovery and candidate confirmation into the Studio reference decision module. It reads the same current document, file-open scope and native reference worker. The final held Fillet or Chamfer confirmation still validates the complete recipe. App owns the accepted document, History commit and keyboard focus handoff. App.tsx decreases from 3851 to 3827 lines.

## Verification

- **PASS, actual desktop keyboard and drawing.** Confirm held Chamfer and Fillet references across two desktop widths. The first keyboard confirmation moves focus to the remaining candidate. The last returns focus to a durable Browser control. Mouse confirmation preserves its existing routing. The final lost drawing endpoint also confirms and returns focus. Undo, Redo and fresh Open pass.
- **PASS, actual two-edge reference workflow.** Preserve the recorded candidate order, held state and the exact signature of the surviving peer edge. The accepted replacement and fresh Open have matching documents and bodies.
- **PASS, actual alternative discovery.** On a matched Flange, Show alternatives completes the native read and exposes the alternate bottom rim. The read preserves document, bodies, selection and History. Confirming the matched reference or explicitly choosing a held Flange candidate works, including browser Project Save and fresh Open.
- **PASS, comparison and controls.** 29 desktop checkpoints and eight observations agree before and after extraction. Compared fields are document, bodies, selection, History and notices. All runs have zero page errors, console errors and watched source changes. Seven focused Studio checks, scoped lint, Studio production build with typecheck, driver syntax and diff checks pass.
- **FAIL, retired test selector.** The initial alternative-discovery run reached the correct choices. Its older exact Confirm reference locator could not find the current accessible button name. The corrected locator was used for both compared runs.
- **NOT_RUN.** Dedicated delayed-worker injection for alternatives, assistive technology, alternate desktop GPU backends, mobile and full local suites.

Use Node 22.19.0 and the installed desktop Chrome and Playwright. Run heavy checks through the shared gate. Freeze worktree writes during browser runs and preserve evidence outside Git.

```sh
node --check apps/cad-studio/test/draft-flange-reference-browser.mjs
git diff --check
node apps/cad-studio/scripts/test.mjs reference-focus drawing-reference-candidate
pnpm exec eslint apps/cad-studio/src/App.tsx apps/cad-studio/src/state/referenceDecisions.ts
pnpm --filter @barocss/cad-studio-app build
cd apps/cad-studio
# Execute each driver on the original runtime and again after extraction.
D1344_SOURCE_FROZEN=1 node test/reference-final-focus-browser.mjs "$EVIDENCE/focus"
TWO_EDGE_CONCAVE_REFERENCE_SOURCE_FROZEN=1 node test/two-edge-concave-reference-browser.mjs "$EVIDENCE/two-edge"
D1001_SOURCE_FROZEN=1 node test/draft-flange-reference-browser.mjs "$EVIDENCE/alternatives"
```
