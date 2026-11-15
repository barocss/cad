# D1408 — supported Extrude binding controls

Issue #95. The generic History parameter wrapper excludes only `extrude` / `draft`. Draft is stored as a plain number and is not a supported parameter reference. Numeric editing and the existing Distance binding remain; native admission, schema and file format are unchanged. The anchored Cut regression now expects no Draft binding control, retaining its original numeric zero/positive/negative transition assertions.

## Verification

- Focused Model tests 15/15 PASS; owned lint, driver syntax and diff check PASS. Model and Studio type checks PASS. Production build PASS.
- Actual isolated Chrome at 1024×800 and 1440×900: the Draft selector is absent; numeric Draft10→14 applies; Distance binds Height=6 while Draft14 and the original sketch remain; Undo/Redo and Save/fresh Open preserve the binding.
- Strict native B-rep checks and bound-versus-explicit-numeric height digest equality PASS. Height6 digest `8c4a601e662b9d0c4b9b04ab53980f843600367a252659b77c7f2c4f99d2b831` persists after reopen.
- Independent section numerical integration (Simpson 2048/4096 convergence below 1e-9 mm³) gives 727.9012298707945 mm³ at Height6/Draft14 versus native 727.9012298807783. Height10 gives 1005.4515839447023 versus native 1005.4515839534121. Native and worker volumes meet the unchanged 1e-7 mm³ tolerance. Two conical supports and seam samples have maximum residual 1.777e-15 mm, below 1e-7 mm. This is not an exact symbolic integration claim.
- Root visually inspected the 1024px Draft-control screenshot and 1440px reopened Height-bound solid. No extra guidance layer was added.
- Local final receipt `d1408-first/receipt.json` SHA256 `54a5500b63d68ba928d9041236df019b1df48f97089a1a90b90b29ff406f6b65`: PASS, no source changes/browser/console errors, four contexts/browser/server closed.

Scope: one prepared radius-10 XY half-disk, inward Draft and positive height; straight-profile and anchored Cut setters additionally covered in focused tests. No assistive-technology, mobile, all extrusion families or CI claim. Existing Drawing baseline failures, #613 overlaps and HOLDs remain. Evidence is local rather than a public artifact URL.
