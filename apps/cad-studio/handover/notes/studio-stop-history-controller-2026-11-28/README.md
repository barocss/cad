# D2155 — Apply the owned Stop rollback in document history

P4 [row 12](../../roadmap-rows/12.md) and [row 22](../../roadmap-rows/22.md) · Base `bf1939e3ce7e5f4818559c6b51517c5cfe1a5b0d`.

The document history controller now applies Stop’s owned History entry. Stop and Undo use the same entry transfer and restore path. The worker recovery controller still matches and retires the pending evaluation. Stop reads the live document and rollback marker, preserves boundary identity and uses the same notices. `App.tsx` falls from 2,330 to 2,320 lines.

## Verification

- **PASS, desktop with actual Worker responses.** The driver holds delivery of the native geometry and mass replies for a 1,000 mm³ Box. Stop terminates the owning worker, discards both replies and returns the unchanged 4,000 mm³ stock. Redo runs the Box again on a new worker. Undo returns to the stock. All five document, body, selection, History, notice and readiness states match the retained D2108 run. This desktop run freezes 699 files and has zero source changes, page errors or console errors.
- **PASS, affected checks.** 78 Studio checks, Studio TypeScript, scoped ESLint, production build and diff check pass on Node 22.19.0.
- **FAIL.** None observed in the selected checks.
- **NOT_RUN.** Natural Worker crashes, mobile and full local suites. The first mechanical CAD baseline is 8/10 accepted. Overall completion is unmeasured.

```sh
D1897_SOURCE_FROZEN=1 node apps/cad-studio/test/model-evaluation-stop-browser.mjs "$OUT/stop"
pnpm --dir apps/cad-studio test stop-work-ownership project-open-ownership document-file parameter-geometry proposal-review
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
