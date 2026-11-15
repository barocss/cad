# D1312 — Retain the Point when join radius inspection refuses

Follow-up to D1311, addressing barocss/cad#498. Implementation is private Studio presentation, not a new native derivative capability.

## Acceptance matrix

- Joined collinear quadratic spans at t=1 retain Point [25,10,0] while Radius says `Unavailable at join; inspect inside a span.`
- t=.5 and1.5 retain [17.5,10,0]/[32.5,10,0] and straight; return to join keeps the point.
- Nonlinear circular two-span join retains [0,20,0]; both adjacent spans yield radius20.
- Repeated parameter changes, straight-control selection and re-selection leave source/document unchanged.
- Native Save/fresh Open preserves source; join Point and adjacent radius remain readable.
- Invalid parameters and unrelated native errors retain their original refusal behavior. Surface queries unchanged.

## Evidence

PASS: focused tests3/3; independent readonly review found no blocker. Actual Mac Chrome WebGPU 1440x1000 and1024x800 flows passed. Final narrow receipt SHA256 `06f45a03b1612857b306baa49866b68f917665314a2355eca756013695d7e8bf`; source frozen/after/cleanup match, zero browser errors or source writes. Inspected final screenshot: Point25,10,0 visible above short two-line Radius status; no horizontal overflow. Native saved file equality passed.

The first1440 flow used the long D1311 message in Radius; shortened after visual review to meet #498's short-status criterion. No numerical tolerance or kernel guard changes. Final Model/Studio type-check, focused lint and production build PASS. Existing generated-doc consistency FAIL unchanged; full suites/mobile NOT_RUN. No manufacturing, dynamics, release or broad kernel qualification implied.

## Next

Issue#153: closed Sweep path explanation at the Path input, retaining recovery to an open path and unchanged documents. Wider-angle display qualification and bulk generated-document drift remain separate. All existing HOLDs remain.
