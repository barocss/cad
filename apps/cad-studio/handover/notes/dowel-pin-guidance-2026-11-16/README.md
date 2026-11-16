# Dowel pin length and flat ends (#28)

The command previously labelled zero length as `flush` and its hint incorrectly said the shaft step's length. The kernel contract is the shaft step's **diameter**. The pin is a centred cylinder with flat ends, not a surface-trimmed plug.

The command label, hint and chat description now state that contract. Saved/evaluated pin bodies show a warning that flat ends are not trimmed to the curved shaft surface and protrusion must be checked. No kernel geometry, defaults, saved schema or manufacturing validation changed.

## Evidence

- Native fixture: shaft Ø20 × 60, cross hole Ø4 at 30, default pin length 20. Pin volume agrees with independent π × 2² × 20 within 1e-7 mm³ and both end faces are planar. At the pin rim, the flat end exceeds the cylindrical shaft surface by 10 − sqrt(10² − 2²), about 0.202 mm. A default full-diameter pin therefore is not a fully flush curved end.
- Baseline: geometry assertions passed; new label assertion failed against `Length (0: flush)`.
- After: related shaft-parts tests 5/5, Model and Studio TypeScript, targeted lint and Studio build (4.46 s) passed.
- Actual frozen-source Chrome: zero/default length and explicit 24 mm length both generated the expected pin volume; the selected body displayed the warning. Undo, Redo and in-memory reopen preserved each accepted document and warning. No browser errors or downloads. Screenshot reviewed.
- First browser attempt failed because Space remained focused on a body button instead of opening the palette. The driver now blurs that button before the normal Space action; product code was not changed for this harness issue.

Driver: `test/dowel-pin-guidance-browser.mjs`, `DOWEL_PIN_FROZEN=1`. Local receipts retain runtime evidence. Existing WIP and HOLD scopes are untouched. This does not close the broader connector-placement criteria of #28.
