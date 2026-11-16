# Explicit constraint-symbol crowding feedback (#264 partial)

Base: `9d309c3b67109b7f45bc7edf06dee89a08a5bb78`. Existing D926 bounded placement remains unchanged: 18×16 px glyphs, 2 px gap, at most 40 px displacement, 128-mark budget. No solver, geometry, constraint, schema, layout offset or native admission change.

The detailed helper reports when a visible mark exhausts its local candidates, or when the mark count exceeds the existing work budget. The old positions-only helper remains compatible. Offscreen and non-finite positions do not count as local crowding; the over-budget path explicitly reports that it did not assess local collisions.

The current sketch then shows a read-only status: symbols are crowded (or the layout limit is reached), zoom in or inspect the Constraints list, all symbols retained. No symbol is dropped or deduplicated. Existing glyph titles/leaders and the list retain the target identities. The message has no pointer interaction, is recomputed with the existing projection/render, and stores no state or document data. Its placement clears the top toolbar and sketch rail in the tested desktop widths.

## Verification

- Layout focused tests **7/7 PASS**: normal layout, local exhaustion, visible/non-finite/offscreen distinction, deterministic identity, empty input and 129-mark budget fallback.
- Wider constraints/identity run **60 PASS / 5 existing stale no-op expectations**. The five failing sketch-edit-identity assertions require a no-op Finish to evaluate/commit once. Existing `3bb2e64b92` and `add32d2acc` intentionally finish unchanged drafts without doing either to preserve history/Redo. Their 786-input bundle contains none of this change's four production/test inputs; there is no changed dependency to rerun. These assertions are not relabeled PASS or edited here.
- Actual new Chrome flow at 1024×900 and 1440×900: valid public-model 20-point polygon with 19 Fixed glyphs, real wheel distance change, explicit crowding message, unchanged titles/solver/accepted document/dirty state, dark/light views, accessible constraint removal through the existing list and draft Cancel. Reducing the draft to two Fixed rules clears the message; Cancel preserves the original accepted 19-rule document. Resize retains the current rule count. No downloads/runtime/console errors/frozen-file changes.
- Existing D926 normal-spacing browser regression **PASS**: two Fixed glyphs stay separate, original target leaders, inline driving dimension edit/Cancel, zoom/resize/reopen, unchanged Finish and native Extrude 1096 mm³. No downloads or errors.
- Affected lint PASS. Final typecheck/build results appended below.

## First failures and scope

The first driver used the solid-feature History selector for a standalone sketch; it was corrected to the real Sketch outline button. Early recovery assumptions incorrectly treated returning to the original fit as guaranteed free space. This 20-point fixture can still be crowded at that scale; retaining the warning is correct. A wheel assertion now verifies actual camera distance change rather than assuming a scroll over overlaid geometry reached the canvas. Recovery is demonstrated through the existing constraint list, then Cancel, not by claiming Fit always solves a dense scene.

Visual review caught the first status placement behind the top toolbar; it was moved below the toolbar before the passing run. Final dark/light screenshots were visually reviewed.

#264 remains OPEN: this adds the missing dense-scene fallback, not family-wide Parallel/Perpendicular/Equal/Coincident, high-DPI, all transition or saved-file acceptance. Existing WIP and HOLDs remain untouched.

```sh
CONSTRAINT_CROWDING_FROZEN=1 node test/constraint-mark-crowding-browser.mjs <output>
D926_SOURCE_FROZEN=1 node test/constraint-mark-spacing-browser.mjs <output> --fixed
```

Final Studio typecheck and production build: **PASS** (5.32 s; existing chunk-size warning). Diff check PASS. No hosted CI or release claim.
