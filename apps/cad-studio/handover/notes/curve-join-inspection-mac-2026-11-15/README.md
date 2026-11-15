# D1311 — Explain curve radius refusal at an internal join

Independent Mac implementation on D1310 (972095d25); no cloud commit imported.

## Scope and frozen matrix

The curve inspector alone formats NativeCurvatureError/DERIVATIVE whose cause is NativeSecondDerivativeError/CONTINUITY. Native geometry, default parameter, derivative guards and surface inspection remain unchanged. Explain inspection inside either span or using the curvature comb; never invent a radius at the join.

Matrix: two-span circular join at t=1; span interiors at .99/1.01/.5; repeated return to join; straight control selection and re-selection; unrelated error chains; unchanged document.

## Verification

PASS: two focused tests, Model and Studio type-check, focused lint; actual Chrome Studio frozen-source flow, repeated inputs and selection replacement. The circular source's nine-decimal serialized weight requires a 1e-6 mm radius assertion: the first test's 1e-9 assertion failed and was corrected, not a product tolerance change. Final browser receipt b79362467424a6088fdb5ccaa13bdbd8c185d3247a45d2eb77203ead69461a56. Screenshot inspected: complete guidance visible, no fabricated Point/Radius at t=1. One unused browser-driver import initially failed lint and was removed.

Production build PASS; independent read-only review found no blockers. Existing generated-document consistency failure from D1310 is unchanged; no bulk regeneration included. Full suite/mobile NOT_RUN.

## Remaining

Issue #498 additionally requires retaining an evaluable Point at the join, which this explanation-only milestone does not satisfy. Keep it open and handle next. Wider-angle display acceptance and all prior HOLDs remain separate. No release, paid inference or manufacturing qualification.
