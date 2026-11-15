# D1354 — Browser idle and selection-detail disclosure (#62)

## Change

Keep the Browser body-count/currentness heading as the empty-state statement, removing No bodies yet. Empty Drafts/References omit only zero summaries, retaining names and Add controls; populated records/counts remain. Selection inertia basis/moments/products move into closed-by-default keyboard-accessible details while face/body identity, bounds, volume and existing approximation labels stay outside.

Reference-local read failures now retain the actual error, separately from pending or successful empty results. Receipts belong to the current reference source and engine; cleanup/source replacement prevents stale publication and immediately hides a stale receipt. No failure is inferred from map size. Existing model-currentness and ReferenceDecisions/refProblems paths remain unchanged rather than replaced by generic empty text.

## Verification

- Twelve focused presentation/quantity tests, Studio tsc, changed-file lint, diff check and production build PASS. Async tests exercise the actual reference read helper cancellation/currentness guards, not a mounted React-hook harness.
- Actual frozen Chrome/WebGPU1024/1440 second run PASS. Empty count appears once; Drafts/References titles/Add controls remain. Real top-face selection retains ordinary dimensions/body properties; keyboard opens inertia, origin basis can be selected, closing hides details without document mutation.
- Populated tetra mesh reference exposes datum faces and count; unconfirmed height draft exposes its count and real Confirm action. Confirmation Undo/Redo and actual Save/fresh Open preserve records.
- Invalid STEP reference shows the actual NOT_READ/no DATA section reason beside its retained source row, not a normal empty state. Opening a clean replacement clears the old error/row. Original document contents are not modified by error display.
- Empty, selected-face and failed-reference screenshots visually reviewed. First browser run stopped on test case sensitivity of CSS-uppercase summary; fixed assertion only. Receipt SHA256 `43a5a5945291bba34771ab1a0a0c90da6e0d8f77e1b335ae73303eadf27f3a54`.

No new geometry, keep-out admission, full-suite or assistive-technology claim. Existing missing-reference recovery remains on its prior path; existing HOLDs unchanged. Next D1355/#83 selected-face count and colour target disclosure.
