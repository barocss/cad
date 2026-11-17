# Direct curve rename follows Undo and accepted source (#29, row 1317)

## Reproduced defect and narrow correction

The existing original `trimmed-surface-region-2026-10-30/studio/run-01/outside-hole.bcad` curve `obj_2` was renamed from `D341 · u-loop` to `Renamed curve` through the public Name input. Undo restored the exact document and Outliner name, but the input remained `Renamed curve`. `before-02-undo-name.png` records that real mismatch. The baseline receipt is a **PASS of defect reproduction**, not a product acceptance pass.

Rename now owns its draft by accepted DirectGeometry identity and object ID, reusing the existing synchronous source-owned draft helper. Undo/Redo or a different accepted owner displays the current name immediately without a name-key remount or delayed effect. Trimmed equality avoids an extra history entry for whitespace-only edits. No callback success is assumed; a refused callback does not forcibly normalize the local draft. Only the Rename call and Rename implementation changed. CurveTools/At-t, model/kernel geometry and the protected original checkout were untouched.

## Actual acceptance

`/tmp/cad-direct-rename-after-01/receipt.json`: first post-fix run **PASS**, exit 0. No post-fix failed attempts. Public UI verifies:

- Rename Enter followed by blur, then one Undo restores the exact original document and current Name input (`after-02-undo-name.png`).
- Focusing/blurring the restored name does not reapply the undone rename; Redo remains available.
- Whitespace around the current name does not add an extra Undo entry.
- Selection of another direct object and return display the corresponding accepted names.
- Native Save's original Blob is intercepted without downloading, parsed and compared exactly to the renamed document. `saved.bcad` contains those original bytes. Fresh Open displays the saved name.
- Public Open of another document with the same object ID displays its different name; subsequent blur leaves that exact document unchanged.

All document comparisons are deep exact: geometry source strings, stored trims, other direct objects, nodes and outputs are preserved; only the targeted object's name changes. No extra native evaluator was run for this text-only change. Source capsule remained 521 files before/after; errors, console errors and source changes were empty. Both contexts, browser and server were cleaned up, then freeze was released.

## Checks and qualification

- Driver syntax and targeted DirectPanel/driver lint: PASS.
- Adjacent `surface-inspection` and `curve-analysis-error` tests: **8/8 PASS**. These are adjacent regressions, not newly added Rename unit tests.
- Studio TypeScript: PASS. Production build: **4.71 s PASS**.
- Logs: `/tmp/cad-rename-focused.log`, `/tmp/cad-rename-tsc.log`, `/tmp/cad-rename-build.log`, `/tmp/cad-direct-rename-after-01.log`.
- Both before/after PNGs were directly inspected: names are readable, synthetic fixture only, no personal information or credentials. The JSON is a minimal receipt extract; full execution receipts remain at the run paths.
- No dedicated Rename Cancel action exists and none was added. Callback-refusal behavior was reviewed but **not exercised in the browser**. Same-ID Open may remount the panel; this run does **not** prove a retained mount with the same accepted name and an uncommitted input across document replacement. No broader #29 closure claim is made here.
