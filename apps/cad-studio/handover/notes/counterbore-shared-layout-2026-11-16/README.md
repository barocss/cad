# Explicit paired Hole layout (#45)

## Frozen acceptance scope
Numeric root-Part consecutive through + wider finite-depth Hole, same current center/pattern, same entry face/axis/side and direct solid parent. No provenance/schema change, automatic linking, repair of already diverged pairs, persistent relationship, renderer matrix or protected WIP changes.

| Row | Required result | Status |
| --- | --- | --- |
| Circular | Copies 4→2 and circle center [20,20]→[17,17] update both nodes; radius/depth/other fields unchanged | PASS |
| Linear | Step [10,0]→[10,6] updates both nodes | PASS |
| Preflight | Step length 5 rejected against wider Ø6, no document mutation | PASS |
| Cancel/ownership | Draft preview, Cancel/Escape and replaced source preserve accepted document | PASS |
| Independence | Explicit two-feature explanation; ordinary single-Hole editing remains independent | PASS |
| Persistence | Atomic Undo/Redo and native JSON re-open; no persistent-link claim | PASS |
| Numerical | Both accepted profiles strict BRep + independent analytic volume | PASS |

Baseline actual Chrome `cad-counterbore-layout-baseline-01` reproduced both circular count and linear Step Y changing only the wider blind cut; Undo/Redo retained this behavior. Linear screenshot visually reviewed.

Analytic oracle for entirely interior, non-overlapping holes: stock 40×40×12; through r=2, counterbore R=3 depth=3. Remaining volume = 19200 − Nπ(4×12 + (9−4)×3). Geometry validation does not establish intended provenance.

## Implementation and verification

`sharedHoleLayout.ts` offers only a compatible pair, explicitly naming both features and showing current centre/pattern before entering the one-time command. Existing geometry preview/evaluation handles both changes atomically. Individual diameter/depth and ordinary single-node editing stay independent. No relationship metadata is persisted. Unmatched, held, suppressed, nonnumeric/bound or invalid pairs are not offered.

A dedicated command ID protects stale HUD Apply and disables repeat. Current document, evaluated source, worker, History and variant ownership are checked. Unchanged Apply closes without Undo/dirty. Both patterns pass existing Hole checks, including the larger diameter's row spacing. Downstream stale `made` groups follow existing edit-command invalidation.

Actual Chrome/WebGPU `cad-counterbore-layout-fixed-01` PASS: no-op Apply retains document/Undo state; changed preview keeps source; Cancel and Escape retain source; wider-hole spacing refusal; circular count/centre and linear step atomic Apply; Undo/Redo; native JSON Open; independent blind-hole diameter edit; New part discards changed preview without a late mutation. No physical downloads. Preview and accepted screenshots visually reviewed.

Independent analytic-volume comparison against native strict BRep: circular two-hole result 18804.159325647695 mm³, linear three-hole result 18606.238988471516 mm³. Both strict-valid single solids, absolute volume error < 1e-6 mm³. Inspector uses native geometry; expected volume is computed independently from the dimensions above.

Focused tests, default Studio tsc and helper/test lint pass. Independent review found and verified correction of downstream-cache, no-op and stale-source boundaries. Full renderer/axis matrix and already-diverged pair repair remain outside this bounded feature. Protected #126 WIP remains the same eight files; all HOLD scopes retained.

Production build PASS (5.68 s). NodeEditor ESLint PASS; full App lint retains the pre-existing unused `_k` error (also present in parent HEAD), so this is not a repository-wide lint pass.

Final focused tests: 4/4, including first-centre synchronization and downstream `made` invalidation without unrelated-node mutation. Final default Studio typecheck follows this test-only addition.
