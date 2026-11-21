# D1583 — Author a circular-segment Smooth Screw from one sketch

P5, row 07, [#630](https://github.com/barocss/cad/issues/630). Base `ae7405b112688272bdd57d4dc99e475f5b2fab5e`.

Select one standalone sketch with one line and one circular arc. Move the local frame to the entered axis and retain the segment starts, arc centre and direction in the copied sections. Use D1582's compact native fit and supporting-disc clearance. Recognize the saved copies before exposing the existing History pitch and angle fields. Share certification within each immutable History draft.

- **FAIL, previous Studio.** With the same source sketch selected, the Smooth Screw palette item was unavailable. Enter created no feature and left the original document exact.
- **PASS, desktop Studio WebGPU.** An axis at `[14, 0]` is refused, with Apply disabled and the original document exact. Axis `[0, 0]` previews, applies, saves and reopens at both +360° and −360°, pitch 40 mm. In History, changing −360° to +360° matches direct +360° creation exactly. Changing pitch from 40 to 48 mm preserves the source and all section profile copies. Fresh Open at 48 mm preserves the exact document and native digest. History displays +360° and 48 mm again after Open.
- **PASS, native and independent checks.** Each accepted result is one strict closed solid with 5 faces, 9 edges, 6 vertices and 3 shared cubic rails. Each rail has the intended winding at 121 sampled parameters. The largest authored station error is below 1.6e-14 mm. The split-arc seam has zero measured gap and tangent differences below 1.26e-14. Volumes are 221.13498549200867 and 221.13498549200844 mm³ for the two 40 mm pitches, and 265.36198259041487 mm³ at 48 mm. The D1582 independent integral and its 48/40 scale agree within 4e-12 mm³.
- **PASS, affected checks.** 47 Model tests, 38 Studio tests, final Model types, scoped ESLint, Studio build, browser syntax and Git diff. The initial type check caught two fixture and height types. They were corrected before the final run. Focused Model cases also cover a valid offset axis, an interior disc axis outside the closed segment, corrupted saved arc control, ambiguous selection and the existing Agent scope boundary.
- **NOT_RUN.** Agent creation and review for this profile, STEP round trip, renderer comparison, mobile and full local suites. #630 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Gate heavy runs and keep Studio captures and project files outside Git.

```sh
pnpm --dir packages/barocss-cad-model test smooth-screw-command smooth-turn-angle smooth-triangular-turn api-loft-guide
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad-model/src/app/{lineArcScrew,ruledTurnCommand,smoothLoftTurn,editFields}.ts packages/barocss-cad-model/src/chat/part/features.ts packages/barocss-cad-model/test/smooth-screw-command.test.ts apps/cad-studio/test/external-axis-screw-loft-browser.mjs
pnpm --dir apps/cad-studio test viewport display-mode history-feature-apply
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/external-axis-screw-loft-browser.mjs
SCREW_LOFT_FROZEN=1 node apps/cad-studio/test/external-axis-screw-loft-browser.mjs "$EVIDENCE/studio" --single-sketch --line-arc
git diff --check
```
