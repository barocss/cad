# D1578 — Author a convex quadrilateral Smooth Screw from one sketch

P5, row 07, [#630](https://github.com/barocss/cad/issues/630). Base `77a083685e0ffc7fc01444017b43c5da7d311f24`.

Admit straight convex four-sided polygon sketches to the existing Smooth Screw command. Reuse the external-axis clearance and D1577 native fit. Recover signed winding and axial advance from the generated sections. Apply the existing centroid motion guard to four-sided winding edits because rectangles have a centered candidate.

- **FAIL, previous desktop behavior.** Smooth Screw was unavailable for each trapezoid and skew quadrilateral sketch. Pressing Enter kept the palette open and preserved the document and zero bodies.
- **PASS, actual desktop Chrome.** An interior axis at local `(7, -5)` disables Apply and keeps each source document exact. An external axis at `(10, -3)` produces a strict closed native solid at +360° and −360° with 40 mm pitch. Each solid has 6 faces, 12 edges and 8 vertices, and each rail has 13 cubic poles. The signed derivative and axial advance pass at 121 samples per rail. The maximum authored station error is `1.482e-14 mm`.
- **PASS, actual History, Save and Open.** Save each −360° project and open it in a fresh Chrome context. The angle and pitch fields show the original values. Changing the angle to +360° gives the same project and native digest as direct +360° creation. Editing the pitch to 48 mm gives the expected axial advance and volume. Save and open each edited project in another fresh context. The project and native digest match the edited result. Both runs have zero runtime errors, console errors and frozen source changes.

| Profile | Native volume at 40 mm pitch (mm³) | Native volume at 48 mm pitch (mm³) | Edited native digest after reopening |
| --- | ---: | ---: | --- |
| Trapezoid | 1360.17492946479 | 1632.20991535775 | `3890d1da8bd5aa4b5e4fe63a8b4544470cc57ed2357cdef7715184c7aa805728` |
| Skew quadrilateral | 980.12605211434 | 1176.15126253720 | `6c90677d1549b25f1a8a72d9280a6df7f7fa6937fa4a2de4483d39f437dd06de` |

- **PASS, affected checks.** 43 Model tests cover direct creation and identical History regeneration, outside-axis validation, refusal controls and legacy profiles. 38 Studio tests, Model types, scoped ESLint, Studio build, browser syntax and Git diff pass.
- **NOT_RUN.** Reviewed Agent authoring and STEP exchange for the new direct quadrilateral profile, curved profiles, mobile and full local suites. #630 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Gate heavy runs and keep project files and captures outside Git.

```sh
pnpm --dir packages/barocss-cad-model test smooth-triangular-turn smooth-screw-command smooth-turn-angle api-loft-guide
pnpm --dir packages/barocss-cad-model type-check
SCREW_LOFT_FROZEN=1 node apps/cad-studio/test/external-axis-screw-loft-browser.mjs "$EVIDENCE/trapezoid" --single-sketch --trapezoid
SCREW_LOFT_FROZEN=1 node apps/cad-studio/test/external-axis-screw-loft-browser.mjs "$EVIDENCE/quadrilateral" --single-sketch --skew-quadrilateral
pnpm exec eslint packages/barocss-cad-model/src/app/{ruledTurnCommand,smoothLoftTurn}.ts packages/barocss-cad-model/test/smooth-triangular-turn.test.ts
pnpm --dir apps/cad-studio test viewport display-mode history-feature-apply
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/external-axis-screw-loft-browser.mjs
git diff --check
```
