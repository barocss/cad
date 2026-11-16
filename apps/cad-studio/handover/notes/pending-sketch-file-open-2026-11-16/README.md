# Original pending R8 sketch at external File Open

Read-only product acceptance for CAD #21, original checklist rows 1173–1174. No product change.

The driver embeds the exact original `line-arc-perpendicular-clean.bcad` and `one-tangent-removed.bcad` documents. Before embedding, both were compared with the original run's pending and after-Open captured documents. Original file SHA-256 values remain in the driver and receipt; JSON is serialized for the actual native file chooser.

| Result | Evidence |
| --- | --- |
| PASS | Actual Chrome at 1440×900 opens the original clean line/arc file and changes Arc 2 radius 7.0711→8 in the existing sketch. The accepted document remains unchanged. |
| PASS | Valid external Open asks `Discard sketch changes?`. Keep editing and a separate Escape retain R8, accepted document, bodies, selection, history, title and dirty state. Screenshots show the R8 constraint and outline. |
| PASS | Explicit Discard closes the draft and opens the exact second document with its own filename. |
| PASS | Document Undo restores the first exact document and `line-arc-perpendicular-clean` title. An actual Save proposes `line-arc-perpendicular-clean.bcad`; downloaded JSON equals the first original document. Redo restores the second document and title. |
| PASS | Receipt has no page errors, console errors or source changes. Exactly one expected Save download. Browser, context and server cleanup completed; process exit 0. |
| NOT_RUN | Restoring the explicitly discarded R8 draft by document Undo is not promised. Folder/project bindings, invalid-file admission, cross-browser/DPI, and camera framing are outside this test. The Undo screenshot shows the solid near the viewport bottom; this is not qualified as framing behavior. |

Driver: `test/pending-sketch-file-open-browser.mjs`.
External receipt: `/tmp/cad-pending-sketch-file-open-01/receipt.json`.
Reviewed screenshots: `02-explicit-discard-prompt.png`, `04-escape-R8.png`, `06-undo-restores-A.png`.

This closes the evidence gap for these two original conditions, not every sketch capability or every #21 acceptance item.
