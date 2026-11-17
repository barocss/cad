# Loop insertion ratio preview — issue #627 A

Source parent: `762394f2124b409c48dd5dbe4dce43341f98a8ec`. Integrated later main `bf57958d1ca6b302938687b6b8950189cb198715` (independent STL test/evidence only) by fast-forward before this commit. Existing unrelated WIP preserved.

## Contract

Insert loop (or L) starts a ratio preview at 0.5. The panel identifies the oriented seed edge: t=0 at its first vertex, t=1 at its second. These are dimensionless ratios, not millimetres. Only finite 0<t<1 is accepted. A zero-length/non-finite rail refuses before the native operation. Existing edge-ring traversal and native insertion semantics remain, including native support boundaries. No kernel topology algorithm changed.

Every ratio update recalculates from the same baseline, never from the previous preview. A successful preview contains exactly one candidate cage Undo step. Apply retains it only after current exact evaluation succeeds; Cancel restores the complete baseline including selection and redo. Invalid values show the baseline and disable Apply. Other cage operations/picking/gizmo and Done are blocked while preview is unresolved. Escape cancels preview even from the input; native input editing remains available. Exact evaluation errors are displayed. Existing session/document identity and stale-response guards still gate Done. Whole cage Cancel discards the draft.

## Verification

- PASS: 12 focused Studio tests (loop draft, cage completion readiness and begin policy). Independent .25/.5/.75 interpolation on an open two-quad strip and a closed box ring; reverse seed orientation; face and selected-edge counts; finite/range rejection; zero-length refusal; mirror identity; Undo/Redo; immutable baseline.
- PASS: Studio TypeScript, changed TS/TSX lint, Vite production build. Existing bundler warnings remain.
- PASS: final actual desktop Chrome/WebGPU 1440×1000. Four-quads-per-side 30×20×16 box. Repeated .25/.5/.75 preview has constant topology size and one candidate undo; the new seed-rail vertex matches independently computed interpolation. Empty, endpoint and out-of-range inputs preserve the baseline and disable Apply. Input Escape, explicit preview Cancel, Apply, cage Undo/Redo, cancellation with existing redo, Done, document Undo/Redo, native Save/fresh Open, and whole cage Cancel after fresh Open verified.
- PASS: zero page/console errors and zero watched source changes; contexts/browser/server closed. Screenshot viewed and checked; it is the actual quarter-ratio preview, not a concept.
- First browser attempt stopped at a test-only assertion on a nonexistent `redo` diagnostic field after earlier preview/apply steps passed. The final driver checks the actual enabled Redo button, then verifies restored geometry. A small input-shortcut preservation refinement was rebuilt and the full final run passed.

Native reopen semantic equality and SHA256 are in `receipt-summary.json`. This is focused evidence, not a full repository or arbitrary-cage conformance result.

## Remaining

Issue #627 remains OPEN: B (existing edge-loop slide) is not implemented. Broader pole/n-gon, pathological closed-ring/mirror and injected reverse-order evaluation browser coverage are not qualified here. Native exact admission remains authoritative; cage interpolation is not a promise about final smooth-surface dimensions or shape preservation. No B-rep widening, schema change, manufacturing claim, or existing HOLD change.
