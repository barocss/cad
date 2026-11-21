# D1551 — Build a smooth rectangular Screw about the sketch origin

2026-11-21 · P5 · [Roadmap row 07](../../roadmap-rows/07.md) · [#630](https://github.com/barocss/cad/issues/630) · Base c26182ace8c2d21dfb5ce5ebf7993c25d0d2ce4c.

The ordinary Smooth Loft now accepts one bounded external-axis case. The shared sketch-plane origin must lie strictly outside the first rectangular section. Every ordered rectangle corner must match a rigid station rotation about that origin. The stations must have positive, uniform axial spacing, 7–16 sections and at most 30° of rotation per interval, within the existing native numerical policy. A shifted axis, deformed section or an axis that touches or crosses the rectangle stays outside this compact path.

Use the same bounded cubic factor and linear axial height as the centred Turns. A common factor multiplies all section coordinates relative to the external axis. Its signed angular derivative is checked span by span. The section transformation has determinant |q|² and the axial coordinate increases across distinct planes. This gives a continuous side in the axial parameter and preserves the physical corner creases. The interpolant matches the rigid sections at the authored stations. The section between stations is a cubic approximation. Loft keeps its existing native file representation.

- **PASS, actual desktop Chrome Studio.** Open seven tilted section sketches, select them, choose Loft in Smooth mode, and Apply. Both +180° and −180° create one closed native solid with 6 faces, 12 edges, 8 vertices and four full-height cubic rails. A 40 mm advance corresponds to 80 mm per full revolution in these cases. The seven signed stations match independent rotation coordinates. Native Save and fresh Open retain the exact −180° document and B-rep digest 6be2d75408796ed5e92a6d91f074a8d803f995e097a4f8c8a7fa17a3170df843. The final browser receipt has zero console errors, runtime errors and frozen-source changes.
- **PASS, independent measurements.** The D1544 cubic-factor integral scaled to a 96 mm² rectangle gives 3841.856147659702 mm³ for ±180° at 40 mm. Studio reads 3841.856147666181 and 3841.856147666184 mm³. Native tests confirm ±180° and ±360° with both a section-area quadrature and the independent factor integral. Rail height and signed winding persist throughout the sampled intervals. Origin contact, a different axis, a translated station and uneven heights are refused by the compact fit.
- **PASS, affected checks.** Eight native and 55 Model tests, scoped ESLint, driver syntax, the kernel library build, Model types, 34 Studio tests and production build with types, and Git diff. Existing centred Turn and two-guide Loft controls pass.
- **FAIL, reproduced baseline and corrected probes.** The unchanged native path refused the external-origin ±180° and ±360° cases with a V control-point limit. Studio reproduced the +180° refusal while its centred control applied. The first baseline probe looked for collapsed kernel detail before expanding it, and the first candidate lint run rejected an overprecise decimal literal. Both probes were corrected.
- **NOT_RUN.** A single-sketch Screw command, explicit pitch authoring, specialised fine display for this Loft, Agent approval, STEP exchange of this Screw, arbitrary sections, external CAD and mobile. #630 remains open.

Use Node 22.19.0 and the installed desktop Chrome and Playwright. Gate heavy work and retain captures outside Git.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{smooth-rectangular-turn,two-guide-loft-display}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs smooth-triangular-turn smooth-turn-angle ruled-turn-command loft
pnpm --filter @barocss/cad-model type-check
pnpm --dir apps/cad-studio test palette-rank loft display-mode viewport
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/external-axis-screw-loft-browser.mjs
git diff --check
SCREW_LOFT_FROZEN=1 node apps/cad-studio/test/external-axis-screw-loft-browser.mjs "$EVIDENCE"
```
