# Direct control-point selection has one owner (#29, row 1323)

## Before / after

The synthetic degree-1 two-point curve follows the existing direct-pole-weight fixture contract. A real mouse click on viewport P1 at `[12,6,0]` selected its ring and gizmo while the panel still showed P0 and XYZ `[0,0,0]`. `before-01-P1-panel-P0.png` records this **real defect reproduction**. The baseline diagnostic receipt is PASS, not a pre-fix product acceptance pass.

The App now owns the exact DirectGeometry snapshot, document generation, object ID and pole key. Viewport picking and the panel use the same selection. There is no implicit P0 selection: the initial panel explicitly says “Select a control point” and has no coordinate/weight fields. A successful explicit pole edit carries the selection to its accepted source; external source changes, Undo/Redo, selection-owner changes and unavailable mode discard selection rather than silently reusing an index. Stale completion checks exact live selection token, current document, source and mode; the gizmo also checks worker identity. Leaving pole mode discards both token and preview delta so returning cannot resurrect an old callback.

`DirectPoleEditor` owns only control-point selection presentation and source/row-owned numeric drafts. Existing CurveTools At-t/Split and shared NumberField were not changed. There are no shared GPU, kernel or schema changes.

## Actual acceptance

First post-fix run `/tmp/cad-direct-pole-selection-after-01/receipt.json`: **PASS**, exit 0; no failed post-fix attempts.

- P1 viewport click updates panel P1/XYZ `[12,6,0]`, without changing the document. `after-01-P1-panel-P1.png` shows the ring and matching panel selection.
- Dropdown P0 selects the corresponding viewport ring; selection changes leave the exact document unchanged.
- Blank Z draft on P1 does not leak to P0, although both points have Z=0. The old validation state disappears.
- Weight `-1` + Enter is rejected and leaves the document unchanged. Changing point resets to saved weight 1 with no stale error.
- Explicit P1 X=14 then weight=2 edits retain P1 selection. Independent Python parsing of the saved native source proves points `[[0,0,0],[14,6,0]]` and weights `[1,2]`; P0 and the other coordinates are unchanged. No native evaluator rerun was needed.
- Each Undo/Redo restores the exact expected document and clears the pole selection; returning to an old source does not automatically restore the selection.
- Native Save original Blob bytes are preserved in `saved.bcad`; fresh Open restores the exact document, initially no pole selection. Explicitly selecting P1 shows saved X14 and weight2.

Source capsule 523→523, source changes/errors/console errors empty. Two contexts, browser and server were closed; source freeze was then released. The screenshots were directly inspected and contain only the synthetic fixture, no personal information. The after-edit screenshot crops the bottom Weight row; its full numeric verification comes from the actual DOM assertions and independent source oracle, not a claim that all fields are visible in that image.

## Verification and limits

- New selection-owner predicate tests **3/3** plus adjacent surface/curve/join tests **13/13**, total **16/16 PASS**.
- Final Studio TypeScript, App lint, changed component/helper/test lint, driver syntax and production build **4.94 s PASS**.
- Initial tsc caught a missing capability in an existing multi-object SSR test. The capability became optional for such callers; actual App always supplies it. Final tsc passed. No public default hidden selection fallback was added.
- Logs: `/tmp/cad-pole-selection-final-focused.log`, `/tmp/cad-pole-mode-final-tsc.log`, `/tmp/cad-pole-mode-final-build.log`, `/tmp/cad-direct-pole-selection-after-01.log`.
- Pure tests cover the ownership predicate and availability boolean, **not execution of an entire captured gizmo callback**. Late callback injection, actual mode transition during a held drag, held-drag movement, trim/periodic topology and same-ID retained-mount replacement were **NOT RUN** in this bounded acceptance. Existing surface weight tests were not rerun wholesale.
- No broader #29 closure claim. The old protected checkout and unrelated WIP/HOLD work remain untouched.

## Changed surface branch smoke

A separate `--surface-only` run `/tmp/cad-direct-pole-surface-01` passed on its first attempt. It does not repeat the curve suite. A synthetic untrimmed 2×2 degree-1 surface is opened through public UI. Selecting P1,1 gives its viewport ring and panel XYZ `[20,10,0]` without modifying the document. Weight 2 applies through the newly connected surface edit branch and retains selection. Independent saved-source parsing proves all four control points unchanged and only weights[1][1] changed: `[[1,1],[1,2]]`. Undo restores the entire original document and clears selection. `surface-02-edited.png` shows the selected ring, P1,1, XYZ and weight 2 simultaneously; directly reviewed, no personal information. Cleanup completed, source 523→523, changes/errors empty. Driver syntax/lint rechecked; no product changes after final type/build.

The curve after-edit image is not used as a marker-motion proof because the moved endpoint is beyond the right viewport edge. Its very large displayed Radius is also **not** a curve-analysis accuracy acceptance result; that existing numerical calculation was outside this selection-only fix. The before/after issue comparison uses only the first selection screenshots.
