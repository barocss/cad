# Direct Move: visible raw vector admission

Bounded #29 correction. Move now has a small DirectMoveControls responsibility composed into Transform as a slot. Its three raw inputs belong to the exact direct geometry plus a stable selected-ID signature. Blank/nonfinite values disable Move with an accessible explanation, and the current handler refuses them. Zero and negative finite distances remain valid; no clamp or geometry change. Other Transform controls and shared NumberField keep their existing behavior. Model/native/CurveTools At-t/Split/WIP/HOLD are untouched. #29 remains OPEN.

## Actual evidence

- `/tmp/cad-move-draft-before-01` FAIL preserved. The source contains both original panel and new moved_1 surface blocks; the first oracle incorrectly selected the first control-points. This was an oracle bug, not a transform failure. Actual accepted object references src_2/moved_1.
- `/tmp/cad-move-draft-before-02` diagnostic PASS. Exact current geometry ID was supplied to the parser and exactly one corresponding surface block required. Blank ΔZ executed the hidden retained +10. All 4 poles matched original+[0,0,10]. This is defect reproduction, not product acceptance.
- `/tmp/cad-move-draft-after-01` first fixed actual PASS. Blank is disabled with unchanged Doc; explicit [0,0,2.5] moves all 4 poles exactly. Original source strings, ID/name, nodes and outputs remain unchanged. Undo/Redo restore exact documents.

The fixture is the existing D347 2×2 affine panel. Independent Python parsing of the selected geometry block checks every pole, not a nearest/last block. Final far and near z coordinates are 15.5/23.5 rather than original 13/21; x/y unchanged. Historical artifact basename retained-ten is shared with baseline but final input/output explicitly records z=2.5. No general native accuracy/support expansion is claimed.

**Intentional lifetime policy:** successful Move, Undo/Redo or a new direct owner resets raw inputs to defaults [0,0,10]. This differs from the old retained numeric state. It is render-current raw draft reset, not proof of rejection of an arbitrarily captured stale callback.

## Checks and limits

- focused 7/7 (new 1 + adjacent 6), first run PASS. Each field blank/whitespace/NaN/±Infinity and direct handler refusal, exact callback [-2.5,0,2.5], new equivalent single-ID array draft retention, changed selection/direct reset. Callback scheduling is not native execution. Multi-ID order reversal and actual multi-selection are not qualified here.
- Studio tsc, targeted lint and driver syntax PASS. Build 6.91s PASS. Logs included as .txt.
- Actual 527-source capsule unchanged; errors/console errors/changes empty. Context/browser/server cleanup before freeze release. Curated receipts preserve original receipt hashes and frozen source hashes.
- Actual PNGs inspected by the implementation agent and root reviewer, synthetic/no personal data. Before: blank with enabled Move. After 01: blank with explanation/disabled Move. After 02: moved panel and reset 10, not a claim that the executed displacement was 10.

No fresh Open/Save lifecycle, captured callback injection, broad native suite or other Transform input cleanup was run/claimed. Existing original failures remain in runtime folders above.
