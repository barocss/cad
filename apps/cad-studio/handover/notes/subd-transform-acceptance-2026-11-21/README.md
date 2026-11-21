# D1504 — Accept the bounded SubD cage transform workflow

P5, row 08, [#625](https://github.com/barocss/cad/issues/625). Base `7cb5f58fadadba042e0fd020e80f225d1de90617`. This acceptance record changes no product or test source.

## Support and refusal policy

- World moves use signed millimetres. World rotations use degrees about the selected centre or an explicit current cage vertex. Uniform scale uses a finite positive ratio. Each preview starts from its original selection and transforms each selected vertex once.
- The edge tangent uses one current nonzero edge, from its lower to higher vertex ID. Face N, U and V require one strictly convex planar quad. N follows winding, U follows the edge from the lowest vertex ID to its winding successor, and V is N × U. Multiple, stale or degenerate elements refuse the selected local frame. The viewport omits a local turn handle when its plane cannot be resolved in the current view.
- Invalid, moved or rebound explicit drag pivot IDs require a fresh pick or entry. A factor of zero, a negative ratio or a nonfinite value is invalid. Identity moves, turns and scale keep the same cage step count and redo state. The selected mirror plane takes precedence over a conflicting transform: original seam points retain zero on that axis and can move along the plane.
- Cage editing writes only the SubD selection. The whole-body commands create their own parametric history steps. Done requires a successful current cage evaluation before it can write one document edit.

## Original issue conditions

| Case | Result and proof |
| --- | --- |
| Independent off-origin +90° coordinates, shared edge vertices, finite limits, nonplanar or degenerate faces and zero-length edges | **PASS**, 19 focused Model tests at this HEAD. The tests use independent expected positions and exercise X/Y/Z mirror strategies. |
| Connected faces, centre and explicit vertex pivots, world axes and correct scale | **PASS** in Studio. [Centre scale](../cage-centre-scale-drag-2026-11-21/README.md), [guarded scale pivot](../cage-vertex-scale-pivot-2026-11-21/README.md), [world Z](../cage-centre-rotation-drag-2026-11-21/README.md), [world X/Y](../cage-world-rotation-xy-2026-11-21/README.md), [world vertex pivot](../cage-vertex-rotation-drag-2026-11-21/README.md). |
| Oblique edge tangent and face N/U/V, signed drags and numeric agreement | **PASS** in Studio. [Normal move](../cage-face-normal-drag-2026-11-21/README.md), [tangent move](../cage-edge-tangent-drag-2026-11-21/README.md), [U/V move](../cage-quad-plane-drag-2026-11-21/README.md), [normal turn](../cage-local-normal-rotation-drag-2026-11-21/README.md), [U/V turn](../cage-local-uv-rotation-drag-2026-11-21/README.md), [edge turn](../cage-edge-tangent-rotation-drag-2026-11-21/README.md), [face turn vertex pivots](../cage-local-face-rotation-pivot-2026-11-21/README.md). |
| Mirrored seam, open boundary edge set, factor 0.5, single vertex and fixed unselected points | **PASS** in Studio. [X-mirrored scale and turn](../cage-mirrored-seam-transforms-2026-11-21/README.md), [open cage](../cage-open-boundary-transforms-2026-11-21/README.md). |
| Cancel, loss of capture, selection and document replacement, current exact Done, Undo/Redo and files | **PASS** in Studio. [Current exact replies](../cage-transform-exact-reply-ownership-2026-11-21/README.md), [held turn ownership](../cage-local-turn-interruptions-2026-11-21/README.md) and the drag records above. The harness injects the pointercancel event and controls real Worker reply delivery. |
| Whole-body Move, Rotate and Scale control | **PASS**, both current desktop browser flows. See below. |

## Current desktop whole-body controls

- Move a 40 × 30 × 10 mm solid with signed absolute coordinates or deltas. Four cases, including translated stock, retain exact authored targets. Maximum stored target residual is 0 mm. The independently read strict B-rep preserves the eight expected vertices, centroid and 12,000 mm³ volume. Point and centroid error limits are 1e-8 mm.
- Edit an existing whole-body Z rotation to 90° and 120°, or uniform scale to 2 and 1.25. Keep the authored X=3 mm pivot parameter on a later numeric edit. Each accepted solid passes the strict native check and all eight independent vertex positions within 1e-7 mm. Rotation preserves 12,000 mm³. The 2× control gives 96,000 mm³ within 1e-6 mm³.
- Both flows verify Cancel, Undo/Redo and native Save/fresh Open. 30 Studio focused tests and Git diff checks passed. There were no current failures.
- **NOT_RUN.** Full local suites, alternate renderers and mobile. No production type/build rerun for the acceptance-only change. Measurements are cage positions or the named whole-body fixtures. General smooth-surface dimensions, nonuniform scale and B-rep vertex editing lie outside #625.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Gate heavy commands. Freeze worktree writes during Studio and keep evidence outside Git.

```sh
node packages/barocss-cad-model/scripts/test.mjs cage-selection-transform cage-local-direction cage-local-rotation
node apps/cad-studio/scripts/test.mjs cage-transform-draft cage-commit-readiness gizmo gizmo-state-presentation
git diff --check
cd apps/cad-studio
TRANSFORM_NUMBER_BINDING_SOURCE_FROZEN=1 node test/transform-number-binding-browser.mjs "$EVIDENCE/whole-body-rotate-scale"
MOVE_TO_COORDINATE_PRECISION_SOURCE_FROZEN=1 node test/move-to-coordinate-precision-browser.mjs "$EVIDENCE/whole-body-move"
```
