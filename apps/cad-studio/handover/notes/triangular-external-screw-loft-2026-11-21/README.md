# D1564 — Build a compact external-axis triangular Screw

P5, row 07, [#630](https://github.com/barocss/cad/issues/630). Base `b11ca24747d8e1e327a88baa304945687b8b5a91`.

## Decision

Use the existing compact rotational Loft fit for an external axis and three straight sides. Keep the kernel's centered triangle and rectangular branches. The external triangle must have a nonzero signed area. The first triangle must exclude the axis, with distance strictly greater than the kernel linear tolerance to each closed segment. Exact represented-value comparisons cover the projection to an edge and the closest vertex. Reuse the common station, signed winding and linear height checks on the three polynomial cubic rails. The result has three single side faces and two caps.

Admission covers 7–16 ordered, uniformly spaced sections with at most 30° per step, a common axis and matching rotated sections. The certificate establishes signed, noncollapsing rotation and linear axial advance. The first-section clearance test does not supply a uniform tolerance margin between stations.

## Evidence

- **FAIL, previous desktop Studio.** Smooth Loft refused a seven-section triangular fixture in both half-turn windings. The kernel detail showed `Surface V control point count must be in 2..16`. The source stayed unchanged. This fixture used different coordinates from the candidate full-turn fixture.
- **PASS, actual desktop Chrome.** Open the input sketches, select all 13 in Studio and Apply Smooth Loft at +360° and −360° over 40 mm. A tilted plane and an axis outside the triangle but inside its bounding rectangle exercise the triangle-specific admission. Each result has one strict closed solid, five faces, nine edges, six vertices and 18 coedges. Sample all three rails at 121 stations and verify signed progress and 40 mm total advance. The maximum error at the authored stations was `6.0820e-10 mm`. Native volumes were `840.108044665452 mm³` and `840.1080446654516 mm³`. The independent cubic section integral reference is `840.1080446694306 mm³`, within `1e-7 mm³`. Native Save and fresh Open of −360° preserved the document, topology and native digest.
- **PASS, focused regression.** 25 Model checks and 38 Studio checks. The Model verifies ±180°, ±360° and ±450°, reversed triangle winding, outward cap normals, full native topology and exact native readback. It admits the closest-vertex case above tolerance, and refuses an interior pivot, two boundary pivots and the below-tolerance vertex case. Both package type checks, scoped ESLint and Studio build pass.
- **PASS, Twist control.** The current desktop Twist search resolved to Smooth Turn. The +360° centered rectangular control had six faces. An exact Ruled Turn still produced 18 faces with deliberate span corners. Smooth Turn saved and reopened with the same native digest. This control does not establish visual accuracy of the sampled walls.
- **NOT_RUN.** Full local suites, STEP exchange for this profile, arbitrary sections and mobile. Direct single-sketch authoring remains pending. The generic Loft uses the baseline viewport packet. D1565 follows with a same-project display comparison after a report of apparent breaks. #630 stays open.

Use Node 22.19.0 and the installed desktop Chrome and Playwright. Gate heavy work and keep all captures outside Git.

```sh
pnpm --dir packages/barocss-cad-model test smooth-triangular-turn smooth-screw-command smooth-turn-angle
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir packages/barocss-cad type-check
pnpm exec eslint packages/barocss-cad/src/features/{loft,loft-rectangular-turn}.ts packages/barocss-cad-model/test/smooth-triangular-turn.test.ts apps/cad-studio/test/external-axis-screw-loft-browser.mjs
pnpm --dir apps/cad-studio test viewport display-mode history-feature-apply
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/external-axis-screw-loft-browser.mjs
SCREW_LOFT_FROZEN=1 node apps/cad-studio/test/external-axis-screw-loft-browser.mjs "$EVIDENCE/studio" --triangle
TWIST_DISCOVERY_FROZEN=1 node apps/cad-studio/test/twist-command-discovery-browser.mjs "$EVIDENCE/twist-controls"
git diff --check
```
