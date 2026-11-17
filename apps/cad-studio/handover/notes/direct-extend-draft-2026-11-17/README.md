# Direct Extend: reject an invalid visible distance

Bounded #29 UI correction. The issue remains OPEN. No Model/native refit, tolerance, surface support, shared NumberField, CurveTools At-t/Split, or HOLD work was changed.

## Behavior

SurfaceTools now owns the raw Extend by draft using the existing exact direct-object owner. Blank, nonfinite, zero and negative inputs cannot schedule Extend and have an accessible finite-positive explanation. A valid value is passed unchanged to the existing operation.

**Intentional reset policy:** a successful Extend, Undo or Redo changes the direct geometry identity and resets the input to initial `5`. Selecting a different object also resets it. This differs from the old retained numeric state. It does not silently execute 5 while the visible field is blank.

## Evidence, without relabeling failures

- Baseline `/tmp/cad-extend-draft-before-01`: diagnostic PASS reproduces the defect. Blank visible input created an extension of retained distance 5. This is not correct-product acceptance.
- `/tmp/cad-extend-draft-after-01`: overall FAIL. Invalid inputs and valid 2.5 source oracle passed, then the driver looked for the original visible row title. Extend intentionally hides its original; the hidden row instead says “Hidden: click to show”. This was a driver assumption, not evidence of a product failure. Original receipt remains preserved.
- `/tmp/cad-extend-draft-after-02`: PASS. Blank/0/-1 are blocked with unchanged Doc. Valid 2.5 creates the new object, preserves original sources/nodes/outputs exactly, and resets the input. Public Show is a separate exact `hidden:false` transaction. Selection changes on the same shown document reset drafts; Undo Show, Undo Extend and Redo Extend reproduce exact documents.

The final run froze 527 source files. Source changes/errors/console errors were empty; context, browser and server cleanup completed before freeze release. Curated receipts retain source hashes and hashes of original receipts. Original full runtime files remain at the paths above.

## Independent oracle and images

`fixture.bcad` is the existing D347 affine-panel fixture, not a newly claimed native qualification. The Python reader parses emitted control-point source and checks only the two far-edge endpoints for distance 2.5: `[17.5,3,13]` and `[17.5,3,21]`, within 1e-7 mm. This is not a new whole-surface refit or curvature accuracy guarantee; the original D347 native evidence remains separate. Input/source and oracle are included.

Before PNG: blank plus enabled Extend. After blank PNG: explicit explanation and disabled Extend. After created PNG: selected extension and reset input 5. Actual pixels were inspected by the implementation agent and root reviewer; fixtures are synthetic and contain no personal data. Runner visualReview metadata requesting root review is historical metadata, not an automated visual verdict.

## Checks

- First focused run: 7/8; new test used aria-label with a helper that selects displayed button text. Test selector corrected, product unchanged.
- Final focused: **8/8 (new 1 + adjacent 7)**, `focused2.log`. Valid callback test verifies scheduling, not geometry execution.
- Studio TypeScript and targeted lint PASS (`tsc.log`, `lint.log`). Production build **5.52 s PASS** (`build.log`).
- Driver after Show correction: syntax and targeted lint PASS. Product checks were not unnecessarily rerun because the correction was driver-only.

No new native suite, Save/Open acceptance, new supported surface type or broader #29 completion is claimed. Existing protected WIP and HOLD scopes remain unchanged.
