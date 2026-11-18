# Revolve numeric Angle binding boundary (#676)

Original main `15bde2401`: a rectangle with radius10–20 and height10, revolved 180° about sketch Y. History offered Angle parameter despite ModelNode.angle and native admission being number-only. Choosing Angle90 made both numeric input and selector appear empty. Apply refused with “angle must be in (0, 360]”. Accepted document, History and native geometry stayed intact. This was an unsupported UI binding, not data loss.

## Change and checks

One product line excludes only Revolve `deg` from the generic binding wrapper in Model editFields. Numeric Angle, other fields and supported profile binding remain unchanged. No new angular binding, schema, evaluator, native geometry or UI framework.

- Original actual baseline PASS, including refusal and exact original document/History/native preservation.
- New unit original 3 PASS / 1 RED (unsupported binder present); final combined Revolve/Extrude Draft/Fillet section/Fillet station 13/13 PASS. An initial test fixture assumed Width at nonzero minX is directly bindable, which existing leaf semantics refuse; the supported Width unit fixture uses minX0. This is not a new product change.
- Changed-file ESLint and diff checks PASS. Studio tsc --noEmit and Vite build PASS.
- Frozen actual fixed run PASS: Angle selector absent, ordinary Width/Depth selectors retained, numeric180→90→120 with Undo/Redo, 361 refusal preserving accepted120, changed100 Cancel preserving120, Depth→Height12 parameter binding, Undo/Redo, Save/fresh Open and reopened input state.
- Baseline/fixed source capsules remain unchanged, errors0 and all owned browser/context/server cleanup confirmed. Images visually inspected.

## Physical evidence and limits

For original/90°/120°/refusal/bound-height/reopened states, check one strict-valid native body plus displayed volume. Independent analytic annular-sector volume is pi*(20²-10²)*height*angle/360. Native cylinders retain radii10/20; vertices lie at those radial distances and Y0/height. Final120° height12 native volume is 3769.9111843077517 mm³. Saved nodes retain numeric angle120 and maxY={parameter:Height}; no parameter was silently baked into the angle.

Actual consumer coverage is one Y-axis rectangular annular sector, not arbitrary meridian/axis-linked or general Revolve acceptance. Invalid values remain governed by existing refusal. Existing HOLDs and doc-sync pause remain; this folder is task-local verification.
