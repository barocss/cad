# Varying Fillet endpoint locations (#118)

## Frozen first scope
One original exact native straight edge, read-only Start/End markers in creation preview and root Part History. No geometry, radius interpolation, selection or saved-reference changes. Curved/multi-edge support is not claimed; ambiguous/stale source locations must not be guessed. Existing WIP/HOLD untouched.

| Check | Expected | Status |
| --- | --- | --- |
| Creation | Start/End at physical source ends; consistent Start radius input; picked/tangent counts retained without duplicate radius rows | PASS |
| Swap | Radius values swap without moving endpoint identities or replacing picked edges | PASS |
| History | Current source endpoints identified, including after upstream length changes | PASS |
| Persistence | Apply, Undo/Redo and native JSON re-open preserve exact selected references | PASS |
| Native oracle | Strict BRep, endpoint-radius geometry and analytic volume correspond to input direction | PASS |
| Ownership | Cancel/edit exit/document replacement retire locations; stale responses discarded | PASS |

Native endpoint rules are not screen-left/right or radius size ordering. Creation follows original selected-edge order. Saved two-end references use the current source endpoints nearest the authored points as a pair; interior stations use the original-to-current edge direction. Raw stored points alone would be wrong after an upstream resize.

## Evidence and limits

Actual Chrome/WebGPU `cad-fillet-endpoint-locations-02` (and unchanged-source 03) PASS: source labels at [0,0,20]/[30,0,20], matching Start radius input; swapped values keep selection and reference coordinates; History Apply/Undo/Redo/native JSON Open; upstream Width 30→40 moves End to [40,0,20] while authored reference points stay unchanged; New part removes all markers. `cad-fillet-endpoint-cancel-01` PASS: Cancel removes markers and preserves source. No downloads.

Native strict BRep and sampled native surface endpoint sections confirm Start/End radii 1→3 and 3→1. Both volumes agree with independent analytic expectation `7200 − 130(1−π/4)` within 1e-6 mm³ (7172.101761241656 mm³). Preview and resized History screenshots visually reviewed.

First run retained: an End-marker visibility wait failed after resize because the old camera cropped the new 40 mm endpoint. The coordinate notice correctly showed End (40,0,20). The driver now uses Frame all before asserting both visible markers; no geometry or UI coordinate workaround was made.

Focused endpoint tests 2/2 include reverse orientation, ambiguous pairing and the native cross-norm nonparallel refusal boundary. Current doc/evaluation/worker/context guards retire stale locations. Independent review confirmed the source-ownership and native direction contracts. Seven existing varying-Fillet drivers received narrow Radius/Start radius selector compatibility updates, and the chain driver now checks values at inputs rather than removed duplicate scope rows; these historical drivers were not all rerun.

#118 remains OPEN: curved and multi-edge/chain locations and interior station markers are not implemented in this first scope. The overlay marks original edge locations, not points on the resulting rounded surface. No selected edges, authored radii or geometry payload is changed by displaying the markers. Protected #126 WIP and all HOLD scopes remain unchanged.

Final checks: default Studio tsc PASS, production build PASS (5.00 s), modified helper/notice/HUD/NodeEditor/Viewport/test lint PASS. Full App lint retains its pre-existing unused `_k` error, not a repository-wide lint pass.
