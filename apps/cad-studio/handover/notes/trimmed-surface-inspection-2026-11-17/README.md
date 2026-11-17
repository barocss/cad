# #1: distinguish stored trimmed regions from support-surface analysis

Parent `28e14fec1ce3235fad8a5a4b245fb91ec5a2b88f`. Small existing Direct inspector repair. No kernel, geometry, saved schema, curve tools or original WIP changes.

## Behavior

The U/V inspector now adds Region to the existing Point/Normal/curvature result. Classification uses the existing `kept` policy over all stored UV trim loops, including their exact boundary; untrimmed support is explicit. Existing native-domain refusal is evaluated first. Existing support-surface numbers remain unchanged, including at points removed by trim. This is a stored-loop classification, not a new exact native-topology certificate or guarantee of pixel hit-test equality.

Iso-curve now explains **before execution** that it uses the whole support surface and does not apply stored trim loops. The button references that visible explanation. Its generation behavior and original surface remain unchanged; no trimmed-iso algorithm was added.

The helper has no result cache: current direct geometry and object identity are read on each inspection. Existing input ownership/reset remains intact. Only SurfaceTools/SurfacePoint and imports in DirectPanel changed; the original checkout's independent CurveTools WIP was not copied or edited.

## Checks

- New helper tests 5 plus existing surface-domain 4: **9/9 PASS**.
- Studio type check, targeted lint, diff check: PASS. Production build: **5.29s PASS**.
- Independent read-only review: no blocker.
- Actual Chrome run 01: **first-run PASS**. The original reported fixture `trimmed-surface-region-2026-10-30/studio/run-01/outside-hole.bcad` SHA256 `3d107731eb788f66df34db09e0919ee6d9fcbe9fde0dc6cf3ff020715f74aa5d` was opened through the public UI.
- For original obj_3: u=0,v=2.5 displays Removed and point (20,1.5,3); u=4,v=2.5 displays Remaining and (40,1.5,3). Both normals remain (0,0,1). The independent affine expectation is x=20+5u, y=-11+5v, z=3.
- Before Iso U0, both visible scope text and button aria-describedby confirm the whole-support/non-clipping contract. A separate Python parser checks generated degree-1 curve poles (20,-4,3) to (20,20,3), tolerance 1e-9, with weights 1,1. The actual last Y is 20.000000000000004. This is literal/affine output checking, not another native evaluation.
- Original source strings, selected object's trims, nodes and outputs remain exact. One curve is added. Undo/Redo restores exact documents. The original native Save Blob matches the accepted document; fresh-context Open preserves it and resets local U/V inputs. Removed classification remains correct after re-entry.
- A separately labelled synthetic inside-loop variant of the same planar support reverses the two classifications and preserves its document. It is not represented as a second external customer fixture.
- Source freeze across 522 inputs remains unchanged through two-context/browser/server cleanup. No captured browser errors or source changes. Actual screenshots were reviewed for readability and privacy; synthetic geometry only.

The original failure is retained in issue #1 and the parent source's missing Region/scope output; no new baseline execution was claimed. General curved-surface accuracy, new clipping, native topology and unrelated HOLD areas were not exercised or widened. The three issue completion requirements are satisfied at this existing inspection contract.
