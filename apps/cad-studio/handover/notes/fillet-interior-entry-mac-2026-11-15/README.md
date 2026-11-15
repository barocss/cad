# D1405 — Varying Fillet interior entry

## Scope and implementation

Issue #146: a supported single native straight edge now exposes the existing Radius controls in Varying mode when End radius is zero-as-same, without entering a temporary positive end value. Product change is one visibility condition in `packages/barocss-cad-model/src/app/commands.ts`. Existing selection eligibility, Constant-mode hiding in Hud, retained unsupported drafts, native admission, geometry, schema and endpoint semantics are unchanged. No permanent explanation layer was added.

## Verification

- Model focused/interior tests 10/10; Studio actual-Hud/family tests 19/19 PASS. Model and Studio TypeScript, targeted lint, browser syntax and diff checks PASS. Final production Vite build PASS.
- Actual Chrome 1024×800 and 1440×900: Constant hides station controls; Varying with explicit End=0 directly offers Ends and interior. The existing mode transition may initialize End to the current radius; the test explicitly edits it to zero, rather than changing that separate policy. Apply produces radii [1,2,1] at fraction0.25; History edits only the middle to2.5 on the same feature. Undo/Redo and native Save/new-context Open retain exact data and native digest. A fresh hole-rim curved selection still hides unsupported station controls. Multi-edge/face negatives are unit-only.
- Independent Python polynomial integration for a40×30×10 box gives initial volume11977.599655912723 mm³ and edited11967.840381914846 mm³. Worker/native results agree within1.4e-10 mm³. Strict B-rep validity and seven axial native sections per case pass; maximum sampled residual1.53e-12 mm. Oracle limits are1e-7 mm³ and1e-6 mm, unchanged on rerun.
- Initial browser run failed only at the curved-control fixture Open: its output key b1 pointed to node2 and native Open normalized it to b2. First failure evidence is retained. Only fixture key changed to b2; all assertions and product stayed unchanged. Complete second run PASS with zero page/console errors and watched source changes; all four contexts/browser/server closed.
- Direct image review confirms visible Radius controls beside End0, the applied model and the1440 reopened model. Numerical correctness comes from the independent oracle, not screenshots.

Receipt `d1405-second` SHA256 `b396132232780bb89ad155a71218f02d3fa9669e9d1d17f257d90796f77a8b7e`.

## Limits

One convex right-angle box edge, Circular section and a curved negative control. No new concave/tangent/curved Fillet support, Conic/G2 changes, mobile or assistive-technology qualification. #144 percentage/ordering parity and #145 unsupported parameter binding remain separate. No full-suite/CI/all-CAD claim; existing six drawing baseline failures, API drift and HOLDs remain.
