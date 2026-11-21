# D1569 — Verify both triangular Screw windings in Studio AP214

P2, row 13, [#630](https://github.com/barocss/cad/issues/630). Base `94eb321ac524d860c042c1ab90e691d8fd9d8daa`.

Extend the STEP acceptance driver and independent Python reader for both signs of the tilted, external-axis triangle. Start with the D1568 approved −450° model. Create +450° through Studio History at the original 40 mm pitch and 50 mm axial advance. Keep the original Loft node during that reversal. Measure the Studio exports as AP214 before opening the exact bytes in fresh Studio sessions.

- **PASS, actual desktop Studio.** Both exports show AP214 B-rep in millimetres and disclose native feature history, semantic PMI and named datum transfer limits. Export leaves each working document exact. Both files open as one strict closed solid with five faces, nine edges and six vertices. The generated face names match after the import prefix. The source proposals and feature history are absent as expected for this exchange profile.
- **PASS, independent file read.** Resolve all Part 21 references. Verify oriented edge loops and three compact cubic rails with matching side support poles. Recover −450° or +450° on each of the three rails. The greatest errors at the 16 authored stations are `1.62806e-14 mm` and `1.46549e-14 mm`. The independent section integrals both give `1050.0612784061157 mm³`. The reopened native volumes are `1050.0612784061143 mm³` and `1050.0612784061154 mm³`. The stored and reopened values agree with the integral within `1e-7 mm³`.
- **FAIL, imported display.** Both native views have a 1,284-triangle structured packet. The reopened views have no structured detail and upload 250 vertices in the coarse packet. The facets are visible on the outer wall. This is the D1570 display target.
- **PASS, controls.** Replay the independent oracle on the previous centered triangle, mixed rectangular Turn and both rectangular Screw files. Run the centered triangle through export and fresh Open in current Studio. All three current browser receipts have zero runtime errors, console errors and frozen-source changes.
- **PASS, affected gates.** 25 Model and 14 Studio tests, scoped ESLint, browser syntax and Git diff. The delivery adds exchange verification and decision records.
- **NOT_RUN.** Other desktop renderers for this exchange run, third-party CAD, arbitrary sections, mobile and full local suites. #630 remains open.

The measured negative file SHA-256 is `9ac79386c18846102b964dc055904b0acb7fdf5ec2fa32dce8736deffb04e43b`. The positive file SHA-256 is `767dcea6b1438b7dcffe85dc03a5a81df354ccbb03bcf670e5ff66349341c396`.

Use Node 22.19.0 and installed desktop Chrome, Playwright and Python. Gate heavy runs and keep AP214 files, model files, screenshots and receipts outside Git.

```sh
TURN_STEP_FROZEN=1 node apps/cad-studio/test/smooth-turn-step-browser.mjs "$EVIDENCE/negative" "$D1568/agent-approved-smooth-screw.bcad" --triangular-screw-negative
TURN_STEP_FROZEN=1 node apps/cad-studio/test/smooth-turn-step-browser.mjs "$EVIDENCE/positive" "$D1568/agent-approved-smooth-screw.bcad" --triangular-screw-positive
TURN_STEP_FROZEN=1 node apps/cad-studio/test/smooth-turn-step-browser.mjs "$EVIDENCE/centered-triangle" "$D1548/reviewed-smooth-turn-reversed.bcad" --triangle
python3 -BI apps/cad-studio/test/smooth-turn-step-oracle.py "$EVIDENCE/negative/approved-turn-from-studio.step" --triangular-screw-negative
python3 -BI apps/cad-studio/test/smooth-turn-step-oracle.py "$EVIDENCE/positive/approved-turn-from-studio.step" --triangular-screw-positive
pnpm --dir packages/barocss-cad-model test step-export-scope smooth-triangular-turn smooth-screw-command
pnpm --dir apps/cad-studio test step-export-preparation
pnpm exec eslint apps/cad-studio/test/smooth-turn-step-browser.mjs
node --check apps/cad-studio/test/smooth-turn-step-browser.mjs
git diff --check
```
