# D1323 — Fill/Bridge selection requirements at the tool (#553)

## Bounded implementation

Model `cageBoundaryReadiness` checks selection topology without constructing geometry. Fill requires one complete closed hole boundary. Bridge requires two separate, equally sized boundaries of matching open/closed type. Interior edges, incomplete Fill boundaries, mismatched counts and mixed types produce a reason. Two matching open chains remain supported. Ready describes selection only, not guaranteed geometry success; native runOp/Kernel admission remains unchanged.

Studio `CagePanel` places reasons on existing tool hover/focus help. Fill/Bridge use focusable aria-disabled controls with guarded clicks; no new permanent explanation area. Keyboard focus exposes the same tooltip and description. Existing F/B native refusal remains. Other operations retain their existing behavior.

## Independent Mac verification

- Node22.19.0: new readiness four plus related15 tests =19/19 PASS. Closed/interior edges, partial/full hole, two holes, count/type mismatch, open chains, invalid selection and immutable state included.
- Actual public box30×20×16, four subdivisions per side, at1024×900 and1440×900. Closed-edge Fill/Bridge, partial-hole Fill, one-hole Bridge show actionable tool-local help; forced actual clicks and Enter preserve the cage/selection/history/document.
- Actual Tab from Ring reaches disabled Bridge, shows tooltip and attaches aria-describedby. No screen-reader session is claimed.
- Whole-loop Fill works and Undo restores the hole. Two actual deleted faces leave94 faces/eight boundary edges; Shift-double-click selects both loops, Bridge produces98 faces/zero open edges. Cage Undo/Redo, Cancel, Done, document Undo/Redo and native Save/fresh Open pass.
- Screenshots visually reviewed for partial-hole Fill help and two-boundary ready state. Final source-frozen receipt SHA256 `e2cd63e07ae2e963896101418138304fbc7e291ba6905aa26b6f35511530ebbe`.
- Model/Studio type-check, focused lint, Studio production build, diff check and independent review PASS.

## Limits / next

Open chains and unequal boundary counts have unit coverage, not actual UI coverage. The UI fixture is the96-face box, not the original52-face report fixture. Smooth-mode readiness, mobile/AT and full suites NOT_RUN. Existing generated-doc drift and unrelated App lint remain separate; CI not awaited. All HOLDs persist. Next D1324/#554: align cage selection mode with actual Fill/double-click/UndoRedo selections.
