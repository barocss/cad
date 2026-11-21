# D1580 — Qualify both quadrilateral Screw windings through Studio AP214

P2, row 13, [#630](https://github.com/barocss/cad/issues/630). Base `83d6b9872c26a4acacb66adfbc5b28be6ab53eb5`.

Use the approved D1579 trapezoid and skew quadrilateral projects. Export −450° from each project. Edit the History angle to +450° and export again at 40 mm pitch and 50 mm advance. Read the emitted AP214 independently and open the exact bytes in fresh desktop Studio sessions.

- **PASS, actual desktop Studio.** Each export uses AP214 B-rep in millimetres and discloses feature history, semantic PMI and named datum transfer limits. Export keeps the working projects exact. The positive History edit keeps the original terminal Loft node.
- **PASS, independent reader and native reopen.** The four files contain closed oriented shells with 6 faces, 12 edges and 8 vertices. Four compact cubic rails match the side supports in each file. Their recovered signed winds match ±450° within `1e-8°`. The maximum authored station deviation is `2.303e-14 mm`. The reopened native topology and prefixed face names match the source. At 121 evaluations per rail, the reopened and original curves have exactly the same positions after ordering along the axis. The imported volume agrees with the independent integration within `3e-12 mm³`. All four receipts have zero runtime errors, console errors and frozen source changes.
- **FAIL, reopened viewport.** All four imported views show visible faceting. The native projects use the 1,712-triangle structured mesh. The imported views use the coarse packet with 326 trapezoid or 302 quadrilateral vertices. D1581 addresses the viewport.

| Profile | Independent volume in either direction (mm³) | −450° file SHA-256 | +450° file SHA-256 |
| --- | ---: | --- | --- |
| Trapezoid | 1700.099212657521 | `d02c0b7575c1fc3a985c9e167d8d4eb18d23747d82bd030d6746b77fc9c9eac6` | `293d6e6691e45d39f359650dd370fdca0d09102f382d18f049ad1364e8672dab` |
| Skew quadrilateral | 1225.071491473802 | `bf4ee785fda1485e583fd8fcb839c8198bcd7356d2c526b451c5b2dae7a01d96` | `a18c467ad30e8e1cacb517166f7cf455d109fb8b5d0739696a1ff70b99f4f7c2` |

- **PASS, affected checks.** 31 Model and 14 Studio tests, scoped ESLint, browser syntax and Git diff.
- **NOT_RUN.** Third-party CAD interoperability, quantitative viewport error in this item, mobile and full local suites. #630 remains open.

Use Node 22.19.0, installed desktop Chrome and Playwright, and Python. Set `PROFILE` to `trapezoid` or `skew-quadrilateral`, `WINDING` to `negative` or `positive`, and `PROJECT` to the matching approved D1579 project. Keep captures and STEP files outside Git.

```sh
TURN_STEP_FROZEN=1 node apps/cad-studio/test/smooth-turn-step-browser.mjs "$EVIDENCE" "$PROJECT" "--$PROFILE-screw-$WINDING"
python3 -BI apps/cad-studio/test/smooth-turn-step-oracle.py "$EVIDENCE/approved-turn-from-studio.step" "--$PROFILE-screw-$WINDING"
pnpm --dir packages/barocss-cad-model test step-export-scope smooth-triangular-turn smooth-screw-command
pnpm --dir apps/cad-studio test step-export-preparation
pnpm exec eslint apps/cad-studio/test/smooth-turn-step-browser.mjs
node --check apps/cad-studio/test/smooth-turn-step-browser.mjs
git diff --check
```
