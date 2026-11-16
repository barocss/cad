# Single open circular Fillet endpoints (#118)

## Frozen scope
One unmerged source-owned open native circle edge, one name and nativeJoint with two distinct face uses. Display endpoints are exact native vertices: brep-tessellate.ts `sampled` overwrites first/last samples with native vertex points and emits Float64 samples; Model mesh.ts preserves those as a/b and deletes nativeJoint when merging edges. No radius-based endpoint reconstruction or approximate curve sampling.

Creation retains original a→b direction; History uses current parent source plus authored-end pairing. Closed, merged, multiple, arbitrary freeform and ambiguous edges remain unsupported. Circular interior stations must never be interpolated on the chord. No public API/kernel/schema changes; WIP/HOLD unchanged.

| Check | Expected | Status |
| --- | --- | --- |
| Preview | R8 quarter rim endpoints [8,0,10] and [0,8,10] | PASS |
| Swap | Radius swap preserves endpoint order and picked/reference identity | PASS |
| History/reopen | Undo/Redo and New part → native JSON Open retain saved refs, radii.at and z10 endpoints | PASS |
| Upstream H10→12 | Kernel refusal preserves the entire document; closing and reopening Fillet retains original endpoints | PASS (refusal, not successful height edit) |
| Geometry control | Existing independent quarter-rim native/Python oracle retains accepted radius direction | PASS |
| Refusals | Closed/merged/no-joint/invalid-circle and curved stations rejected | PASS |

## Evidence and limits
- Frozen actual browser run `/tmp/cad-fillet-circular-endpoints-02`: PASS. Creation, preview radius swap, History radius swap, reference identity, Undo/Redo, native JSON reopen, failed upstream edit, closing editor and New part. Reviewed `05-retained-circular-ends.png`: both Start/End labels visible. No physical Project Save/download was tested.
- Independent native/Python quarter-rim geometry oracle passed for .6→1.2 and 1.2→.6. Swapped expected volume 500.4505310301965 mm³; maximum native/worker error 2.2947756406210829e-7 mm³; maximum section residual 4.2812541040570896e-8 mm; endpoint trim residual 6.390221685137476e-12 mm.
- First run `/tmp/cad-fillet-circular-endpoints-01` failed expecting the H10→12 Apply to succeed. Actual error: `B-rep: analytic Boolean: the surfaces of n1.top and n2.face meet along a curve that cannot be traced (boundary bracket has no inside starting point)`. No kernel/model files changed in this patch. This is a reproduced kernel limitation, not claimed fixed or independently baseline-bisected. Second run explicitly verifies refusal/state preservation instead of claiming height-edit support.
- Focused helper tests: 5/5 PASS, including malformed/merged/closed/no-joint circle guards and no chord station interpolation. Target lint and Studio TypeScript check PASS. Production build result recorded below.
- Independent review found no blockers. Multi-edge chains remain deferred: creation uses rounded coordinate keys, whereas reliable current endpoint direction needs topology-identity agreement; proximity alone is not accepted. Curved interior, closed loops, arbitrary freeform curves and multi-edge endpoints remain unsupported. #118 remains open.
- Existing protected checkout WIP unchanged; native-folder and other HOLD ranges untouched. No schema/public API/kernel changes. Remote CI status must be reported separately from local checks.

- Final production build: PASS (4.79 s), existing dynamic-import/directive warnings only.
