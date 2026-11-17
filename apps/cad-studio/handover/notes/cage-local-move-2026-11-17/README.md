# #625 bounded local-direction numeric move

2026-11-17. Tested baseline e451aaaed plus change; subsequent independent assembly commit integrated separately. This is partial #625 acceptance, not full local transform support.

## Contract

Move selection now offers World axis (unchanged default), Single edge tangent, or Single quad normal. A tangent follows the **lower to higher vertex ID**, not pick order; normal follows quad winding. The unit vector and meaning are shown. Signed distance is millimetres along the immutable original cage direction, not a smooth-surface normal. Preview input changes never derive from the previous candidate.

- Edge: exactly one current nonzero edge. Face: exactly one planar, strictly convex quad. Multiple selections, nonplanar/concave/degenerate faces, stale topology or nonfinite direction refuse with the original draft retained. No arbitrary normal averaging.
- Face length/planarity tolerance: max(1e-9 mm, face extent × 1e-9); normalized turn threshold is its relative value squared. Directions normalize after max-component scaling to avoid overflow/underflow for finite extreme vectors. Unsupported coordinate subtraction/extent overflow refuses.
- Shared transform validation, original mirror-seam constraint, exact receipt Apply, one-step history, no-op and Cancel/Escape policy unchanged. Local movement doesn't extrude. UV planes/local rotation/scale and local gizmo drag remain unsupported.

## Verification

- **38/38 Model**, **19/19 Studio** focused tests PASS. New model tests use an independent 3-4-5 tilted fixture normal (0,-.8,.6), winding reversal, edge direction pick-order independence, selected/unselected coordinate expectations, world/commitDrag equivalence, mirror, undo/redo, extreme directions and invalid inputs. Initial draft test mistakenly classified a valid convex trapezoid as invalid; corrected fixture, not product behavior. Concavity tested with valid single-face topology.
- Model/Studio types, changed-source/test lint, production build PASS. Independent model and UI review no blocker. Type execution was briefly SIGSTOP/SIGCONT paused to avoid overlapping a sibling browser run; no process killed.
- Actual Chrome/WebGPU **first browser run PASS**, 1440×1000: two-face normal refusal with baseline preservation; single edge -1/.5/1 tangent previews + input Escape; single face rotated 15° around X, then normal -1/.5/2 independent oracle (0,-sin15°,cos15°); empty input refusal; exact Apply, cage/document Undo/Redo, Done, native Save/fresh Open semantic equality. Stable source, zero page/console errors, owned browser/server/context cleanup complete.
- `local-normal-preview.png` is pending exact evaluation, not an accepted build claim. `fresh-open.png` is accepted reopened smooth geometry. Actual pixels inspected. Cage displacement isn't a final-surface dimensional or manufacturing guarantee.
- Local edge Apply/native persistence, injected stale evaluation, pointercancel/lost capture, broad shapes/mirror browser cases NOT_RUN; covered portions are explicitly separated above. No B-rep/GPU/HOLD/schema/dependency expansion. Issue stays OPEN.
