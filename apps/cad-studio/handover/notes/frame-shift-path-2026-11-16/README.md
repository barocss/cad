# Frame path Shift picking (#28)

The reported Box gizmo interception is already fixed by `41080be68` (D1248). No additional product change was needed.

A focused frozen-source actual Chrome run on main `d6c06c6f9` exercised the complete Frame handoff rather than repeating the existing drag suite:

1. Open a 20 × 20 × 10 layout Box in memory and select its top front edge.
2. Shift-click the top right edge beneath the passive Width handle. Both edges stay selected; Edit Box does not open and the document is unchanged.
3. Shift-click removes the second edge; another Shift-click restores it.
4. Start Frame. Skeleton defaults to Picked edges. Set rectangular tube 4 × 4, wall 1, radius 0 and Apply.
5. Stored frame has two segments and exactly the three expected endpoints: [0,0,10], [20,0,10], [20,20,10]. The original Box nodes are unchanged and three bodies are present.
6. Undo restores the exact layout document; Redo restores the accepted Frame document.

PASS: `test/frame-shift-path-browser.mjs` with `FRAME_SHIFT_PATH_FROZEN=1`. No downloads or browser errors. Actual result screenshot reviewed. Source hashes and local receipt are retained in the run output. Driver syntax and diff check passed. Product code was not changed, so no redundant production build was run.

This resolves the reported Shift-pick acceptance case, not all connector placement or failure diagnostics in #28. Active gizmo precision and intentional handle drags retain their existing D1248 verification scope. Protected WIP and HOLD scopes were untouched.
