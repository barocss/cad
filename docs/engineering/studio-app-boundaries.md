# Studio App responsibility boundaries

## First extraction (2026-11-16)

`App.tsx` remains the composition root and accepted-document owner. This incremental,
behavior-preserving refactor reduces it from 3,985 to 3,815 lines. It is not the end
of the App decomposition: the large inspector JSX and command-launch orchestration
still need separately reviewed slices.

The extracted modules have narrow responsibilities:

- `app/commandReferencePicking.ts`: route original-source face/axis/sweep picks to
  the active command, retire queued Apply and stale previews, and publish local
  selection feedback. It cannot commit a document.
- `state/historyFeatureApply.ts`: admit generic History edits, preserve pattern
  staging and rounded-inset routing, evaluate candidates, and prove terminal
  rectangle Fillet/Chamfer reference preservation before calling App's commit.
  Late replies must still own the draft, document, editor scope, worker and open
  intent. The reference proof additionally respects marker/variant retirement.
- `state/useFilletEndpointDisplay.ts`: own read-only endpoint evidence and the
  transient station draft. Effect dependencies, source identity checks and draft
  cleanup retain the original behavior. It never changes the accepted document.
- `app/studioNotice.ts`: share the existing notice contract without importing App.

New behavior should enter its domain module rather than extend App's inline
handlers. Do not turn these modules into a generic all-purpose controller or move
central commit/undo into them. Keep model/owner/worker/change capabilities explicit.

## Verification

Focused tests include 10 new controller tests: successful owned History commit,
blocked admission, late replies after five distinct ownership changes, unrelated
command routing, stale pick retirement, and invalid target feedback. Together with
existing endpoint, pick feedback, end-face mapping and rectangle signature tests,
24 tests pass.

Actual Studio browser regressions pass for:

- `fillet-station-location-browser.mjs`: held preview response, live interior
  stations, invalid fractions, History draft/reset/apply, Undo/Redo, reopen,
  resize and source-relative endpoint locations.
- `rectangle-chamfer-resize-browser.mjs`: enlargement/shrink, depth changes,
  Undo/Redo, reopen and invalid depth refusal, with independent geometry/volume
  checks. Screenshots confirm station positions and the retained invalid-edit model.

Studio TypeScript, targeted lint (including App and new tests), and production
build are required before publishing. No kernel capability, document schema,
reference policy, native picking scope or HOLD/WIP scope is expanded.

## Second extraction (2026-11-16)

App now has 3,729 lines (256 fewer than the initial baseline). Two more cohesive
boundaries replace inline inspector and command event code:

- `ui/InstanceInspector.tsx` composes the selected placed-part/bearing panel,
  pattern, occurrence appearance, sub-assembly joints and revision controls.
  The App still owns visibility, selection, bearing session and commit/undo.
  The component receives only the assembly ground/remove capabilities it uses.
- `app/commandHudActions.ts` admits hole presets, HUD input and Apply events.
  It preserves queued Apply/repeat retirement ordering, source and snapshot
  ownership checks, preview retirement, and the subscribed value publication.
  It cannot write an accepted document directly.

Eleven additional tests cover HUD event ordering, notice ownership, hole preset
admission, stale Apply snapshots, inspector visibility, free-copy semantics and
selection cleanup only after an accepted removal. Combined focused suite: 35/35.
Actual Studio instance pattern and looks/revision drivers and the Fillet station
HUD driver pass. They include independent placement/BOM arithmetic, Undo/Redo,
Save/reopen, invalid pattern/removal refusals, appearance reset and live/stale
preview handling. Screenshots were reviewed for instance controls and geometry.

This is a structural change, not a revision-import lifecycle fix: the pre-existing
async revision callback has not gained a new cancellation policy. Remaining
large slices include generic feature-editor composition, parameter candidate
coordination, and the wider workspace shell. Decompose those by ownership rather
than by arbitrary line count.
