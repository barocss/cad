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

## Third extraction (2026-11-16)

`ui/HistoryFeatureEditor.tsx` now composes the base-part feature editor, read-only
Fillet/Align evidence, rounded-inset affordances and saved Draft/Offset/Hole-layout/
end-face command entry. App still owns the accepted-document apply controller,
feature draft retirement, direct candidate cleanup and focus restoration on close.
The component's owner accessors preserve the existing source checks before and
after asynchronous face-end distance reads. App is now 3,685 lines, 300 fewer than
the original baseline; this count is a checkpoint, not the architectural goal.

Six more tests cover prop/evidence forwarding, source-sketch navigation,
discard/close/launch ordering, stale/rolled-back/busy admission and late distance
replies. Combined focused suite: 41/41. Actual Studio regressions pass for canceled
workspace/history draft navigation, saved end-face binding/cancel/reopen, and
exact-distance detach including canceled reads. Screenshots retain the expected
feature fields and unchanged geometry on refusal. No new feature, reference
policy or lifecycle behavior is introduced.

## Fourth extraction: candidate reference evidence (2026-11-16)

`state/candidateReferences.ts` owns one domain contract rather than another slice
of JSX: check final-body reference names against accepted/candidate bodies, then
refresh signatures using exact parent geometry. Its preflight remains synchronous;
missing names still refuse before the refresh request. Parent lookup retains the
same-input result, accepted-result cache, then worker-read order. A worker reply
must still be current and contain the exact named parent source.

The helper does **not** own evaluation scheduling, candidate acceptance, mass
updates, work tokens, Undo or installation. App's post-await ownership check remains
mandatory even for cache-only/no-reference paths. No aliases are invented and no
reference matching policy changes. Five native geometry tests cover missing
final-body names, source immutability, successful parent evidence, accepted cache
reuse, stale worker replies and missing parent names. Combined focused suite is
46/46. Actual parameter invalid-geometry/retry and staged direct surface parameter
workflows pass, including source retention, Undo/Redo and Save/reopen. App is 3,666
lines; the purpose of this extraction is independently testable reference policy,
not the 19-line reduction.

### Next ownership boundary, before moving the main effect

The remaining evaluation effect serves both ordinary document evaluation and
parameter/direct/rounded-inset candidates. It shares `acceptedEvaluation`,
`parameterHandoff`, `parameterMass` and work-run identity with App's admission and
mass callback. Moving the whole effect behind a large bag of setters would hide
that coupling rather than remove it. Keep it in App until the following contract
is established:

1. One candidate/evaluation controller owns staged result evidence and result
   reuse. It receives explicit source document/input identity and a run token;
   App retains document-change authority and the only accepted-document commit.
2. Acceptance returns the installed target identity, not just a success flag.
   A result handoff can be consumed once and only for that exact identity/key.
3. Deferred masses patch only matching staged/installed result identities. Neither
   stale mass data nor cache reuse may revive canceled work or mark it fresh.
4. First add characterization tests for display-only cancellation/reuse,
   document Open and worker replacement, marker/variant changes, rejected commit,
   direct-candidate cancellation, and mass arrival both before and after handoff.
   Then move the state and lifecycle together in one reviewed change.

This is the next substantial architecture step. Do not split each setter or
condition into its own wrapper merely to lower App's line count.

## Fifth extraction: result evidence lifecycle (2026-11-16)

`state/evaluationEvidence.ts` now privately owns accepted-result cache, single-use
result handoff and deferred candidate mass evidence. App supplies lifecycle events
instead of mutating three separate refs. It still owns run tokens, current-source
checks, document acceptance and UI installation; consuming a handoff does not itself
authorize reuse. Seven characterization cases fix exact target identity, accepted
restore, mass arrival before/after acceptance, request-specific cancellation,
worker reset and retirement when an equal-content document has different identity.
The native mass/client/reference focused suite passes 18/18. Parameter retry and
real Worker mass/BOM/Undo/Redo/Save/reopen browser flows pass. The existing mass
browser driver now opens the current Inertia details disclosure before reading it.
This is a state ownership improvement, not an attempt to move the main effect as-is.
