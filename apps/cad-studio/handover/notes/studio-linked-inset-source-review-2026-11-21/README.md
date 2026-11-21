# D1464 — Give Linked Inset source review one owner

P4, row 22. Base: `b867b922becd28a6a5585250235406e8e779c56b`. Related closed issue: [#36](https://github.com/barocss/cad/issues/36).

Move Linked Inset source readiness, native pick admission, preview labels, stale-result checks and accepted apply into `sketch/insetSourceReview.ts`. App supplies the current document, owner state, worker and central commit. The existing review hook owns the pending request and cancellation. App drops from 3924 to 3868 lines.

## Verification

- **PASS, actual desktop Studio.** Cancel by Enter and Escape returns focus to Replace inset source. Selecting another History step retires the open review and keeps the new focus. Keyboard Apply returns to Extrude 4. The native side-source ring measures 1024 mm³.
- **PASS, historical names and file.** A prior stock that is referenced through History keeps its authored Browser name, exact native face and earlier Extrude label. After the replacement, the ring moves from 960 to 1024 mm³ with centroid `[130, -2, 4]` mm. The other two native outputs stay exact. Undo, Redo, Save and fresh Open pass.
- **PASS, independent desktop relink flow.** A 4 mm Extrude of the 2 mm inset ring moves from `(40 × 24 − 36 × 20) × 4 = 960` to `(60 × 24 − 56 × 20) × 4 = 1280` mm³. The canvas shows the ring and its clear center. An empty Distance draft blocks replacement. A re-pick or a successful Open retires a held worker response. Apply, Undo, Redo, browser project Save, fresh Open and a later source width edit pass. All three final receipts have zero page errors, console errors and watched source changes.
- **PASS, affected checks.** 32 Studio tests, affected lint, browser driver syntax and Studio production build with type checking. The first lint run found an unused type import left by the extraction. Removing it passed the rerun.
- **NOT_RUN.** Full local suites, mobile, separately forced WebGL2 and performance measurement.

Use Node 22.19.0 and the existing desktop Chrome and Playwright. Run heavy commands under the shared gate and keep browser evidence outside Git. Freeze worktree writes while each browser flow runs.

```sh
pnpm exec eslint apps/cad-studio/src/App.tsx apps/cad-studio/src/sketch/insetSourceReview.ts
node apps/cad-studio/scripts/test.mjs midpoint-sketch document-file failed-feature proposal-history-focus
pnpm --filter @barocss/cad-studio-app build
cd apps/cad-studio
D1204_SOURCE_FROZEN=1 node test/linked-inset-review-focus-browser.mjs "$EVIDENCE/studio-focus"
D1204_SOURCE_FROZEN=1 node test/linked-inset-review-focus-browser.mjs "$EVIDENCE/studio-historical-names" --historical-names
D870_SOURCE_FROZEN=1 node test/associative-inset-relink-baseline-browser.mjs "$EVIDENCE/studio-relink" --relink
```
