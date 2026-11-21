# D1478 — Put mesh badges with their Body Browser rows

P4, row 22. Base: `26e03174d4c124fc19a166e2d5a88b8278b33c59`.

The Body Browser already owns the evaluated feature list and selection for each row. Move the repair, open-sheet and self-intersection badges there. App supplies the existing repair action. The Browser selects mesh fill faces and crossing points in the same order as before. App.tsx decreases from 3868 to 3851 lines.

## Verification

- **PASS, actual desktop before and after.** Import the local sphere with one missing cap. Check and apply coarser fill. The repair badge selects the one filled face and opens the original repair settings. Cancel preserves the exact accepted document. Native mesh Save and fresh Open retain the same badge action and selected face.
- **PASS, actual crossing selection.** The intersecting-shell STL opens as two bodies with 30 diagnosed crossings. Clicking each badge selects the same recorded 30 world-space points with the clicked row's body index. The original mesh document is unchanged.
- **PASS, comparison.** The original and refactored runs have equal document, bodies, selection, history and notices at all three selected desktop checkpoints. Both runs have zero console errors, page errors and watched source changes.
- **PASS, controls.** Actual Body Browser reveal, 23 focused Studio tests, scoped lint, Studio production build with typecheck, browser driver syntax and diff checks.
- **NOT_RUN.** The open-sheet badge's live import path, alternate desktop GPU backends, mobile and full local suites.

Use Node 22.19.0 and the installed desktop Chrome and Playwright. Run heavy checks through the shared gate. Freeze worktree writes during desktop runs and preserve receipts outside Git.

```sh
node --check apps/cad-studio/test/body-browser-mesh-badges-browser.mjs
git diff --check
node apps/cad-studio/scripts/test.mjs mesh-repair-corpus mesh-import-ownership body-browser-reveal
pnpm exec eslint apps/cad-studio/src/App.tsx apps/cad-studio/src/ui/BodyBrowserRows.tsx
pnpm --filter @barocss/cad-studio-app build
cd apps/cad-studio
# Run the same driver once on the original runtime and once after extraction.
BODY_BROWSER_MESH_BADGES_FROZEN=1 node test/body-browser-mesh-badges-browser.mjs "$EVIDENCE/studio"
BODY_BROWSER_REVEAL_FROZEN=1 node test/body-browser-reveal-browser.mjs "$EVIDENCE/reveal"
```
