# D1380 — curvature comb zoom clipping

Completes #148. Each spoke and adjacent tip segment is clipped to the viewport independently. A rejected segment breaks its envelope run; native knot spans remain separate. Orthographic annotations ignore the Studio near/far range, which differs from the GPU auto-clip range. Perspective segments clip in homogeneous coordinates in front of the eye before division. No global camera, geometry, measurement, depth-buffer or occlusion-policy change.

## Verification

- Node 22.19.0: 30/30 focused segment, camera-projector and component-run tests PASS. Covers ordinary pixel parity, viewport crossings, eye crossings, behind-eye rejection, finite bounds, invalid local inputs, camera immutability and separate runs.
- Studio TypeScript, focused lint and production build PASS.
- Actual Chrome WebGPU at 1024×800 and 1440×900 PASS: the original native R2 G2 edge, scale 64, five wheel −280 zoom steps, scale 4, Frame all, and a framed perspective control. Zoom 5 retains 6/7 visible strokes respectively; Frame all and perspective control retain 8. Eight native samples, range and document remain unchanged. Six zoom/scale/frame screenshots were visually reviewed.
- Camera evidence shows Studio projected depth below −1 from zoom 2 while the GPU-visible selected edge remains onscreen. This verifies the mismatched-depth cause for this fixture; it is not a new old-code baseline run.
- Existing actual Direct-curve regression PASS: independent derivative/SVG oracle, Reverse, same-ID pole edit, scale, selection and document replacement.

## Evidence custody

Local run directory: `/tmp/d1310-publish.1Wqzsz`.

- `d1380-first/receipt.json`: SHA256 `f9d60e46e2422cf5ae5e8538071b000b04364ca80c41d2157b045dbd2b344481`.
- `d1380-direct-regression/receipt.json`: SHA256 `76b7c95d44b86e7dbf8ae143cffd50be9d53205ff7d36eb768d758ec7b6828a4`.
- Build log: `d1380-build.log`.

An early baseline launch overlapped implementation and was stopped before a receipt. It is invalid mixed-source evidence, not a product failure. An initial test invocation used Node 18; rerunning with the required Node 22 passed. No full-suite, assistive-technology, arbitrary-camera or general occlusion claim. Existing aggregate documentation/inventory drift and all HOLDs remain unchanged. CI is not awaited under the owner instruction.
