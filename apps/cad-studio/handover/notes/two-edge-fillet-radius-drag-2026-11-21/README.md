# D1476 — Drag one radius for two opposite Fillet edges

P4, row 20, [#214](https://github.com/barocss/cad/issues/214). Base: `ba982361d0a20b92aa3650b5e08134db1edd2392`.

Extend the desktop Fillet test to the two opposite straight top edges of a 40 × 30 × 10 mm stock. Click the first edge and Shift-click the second in the viewport. If Studio opens Chat to show the picked references, dismiss it and verify both selections remain before the command starts.

## Verification

- **PASS, actual desktop Studio.** The command reports two picked native edges and shows one radius handle. In the orthographic end-on view the sampled guide projects to 0.0000248 CSS px. The 24 px upward drag goes from R2 to R3.5 at 16.3930 px/mm. While held, wheel zoom preserves the captured conversion. After zoom, the next gesture from R2 reaches R3 at 30.7796 px/mm. Cancel preserves the exact source.
- **PASS, preview and exact geometry.** Both rounded edges are visible in the dragged R3.5 preview while the source remains unchanged. Apply retains `n1.side0|n1.top` and `n1.side2|n1.top`. The independent volume is 11789.690200129498 mm³. Strict native B-rep and native/Studio Worker volume at 11789.690200129502 mm³ agree. Both fillets match independently calculated end vertices and rational section midpoints.
- **PASS, history and file.** Undo restores the exact source. Redo and separately typing R3.5 produce the drag recipe. Save and fresh Open preserve both original edge references and the same exact verification.
- **PASS, control.** The desktop single-edge perspective scenario, 31 focused Studio tests, browser syntax and diff checks pass. No runtime code changed.
- **NOT_RUN.** Multiple edges in perspective, adjacent or curved edges, History editing, alternate desktop GPU backends, mobile, full local suites and a local production rebuild for this test-only change. #214 stays open.

Use Node 22.19.0 and the existing desktop Chrome and Playwright. Use the shared gate, freeze worktree writes during browser runs and retain evidence outside Git.

```sh
node --check apps/cad-studio/test/fillet-end-on-handle-browser.mjs
git diff --check
cd apps/cad-studio
node scripts/test.mjs scalar-handle-drag gizmo
export FILLET_END_ON_SOURCE_FROZEN=1
node test/fillet-end-on-handle-browser.mjs "$EVIDENCE/studio-two-edges" --two-edges
node test/fillet-end-on-handle-browser.mjs "$EVIDENCE/studio-single-control" --perspective
```
