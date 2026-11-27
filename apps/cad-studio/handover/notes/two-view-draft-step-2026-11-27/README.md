# D2081 — Verify STEP from the approved four-part reference draft

P2 [row 13](../../roadmap-rows/13.md) · [#747](https://github.com/barocss/cad/issues/747) · Base `053b423c9b04d2c37c9526242ac886c1f3ee47e5`.

Export the edited native assembly from [D2080](../two-view-native-draft-2026-11-27/README.md) through desktop Studio. The export panel lists four placed bodies, AP214 and millimetres. It reports that the placed bodies are flattened and that native feature history and assembly hierarchy are lost. The editable source and its reference assumptions stay in the `.bcad` file.

## Verification

- **PASS, actual desktop Chrome WebGPU.** Fresh Open of the edited native file shows the separate ring head, handle, filter cap and button in orthographic Front, Right and Iso. The actual export downloads a 25,898-byte STEP. The document stays unchanged. The run retains 1,078 frozen source hashes and reports zero page or console errors.
- **PASS, actual STEP bytes.** The active advanced B-rep representation references a length unit of millimetres. The native STEP reader returns four separately closed solids. Their world bounds agree within 0.000001 mm and their individual volumes agree within 0.00001 mm³ with the analytic dimensions, rotations and placements of the accepted parts. The head preserves both cylinder radii and its Y axis. The head and handle overlap at an analytically checked point. The button overlaps the handle by 3.00447 mm along Y and protrudes 4.63189 mm. The handle and filter cap retain the 0.06255 mm gap in the approved draft. The remaining three disjoint pairs stay disjoint along Z.
- **PASS, small checks.** Browser-driver syntax and staged diff checks pass. The STEP producer and reader are unchanged.
- **FAIL.** No failures in the final export flow.
- **NOT_RUN.** Real photos, live models, external STEP readers, production fit or material validation, the full local suites and mobile. First mechanical CAD acceptance remains 8/10. Product-wide completion remains unmeasured.

| Imported solid | World envelope X × Y × Z (mm) | Volume (mm³) |
| --- | --- | ---: |
| Ring head | 88 × 53.70492 × 88 | 194,757.93769 |
| Handle | 22.01638 × 20.02981 × 68.04691 | 30,007.58836 |
| Filter cap | 25.64408 × 23.66021 × 12.57185 | 7,627.90070 |
| Button | 7.63068 × 7.63636 × 11.57111 | 674.25582 |

The #747 synthetic acceptance also uses [D2079](../two-view-reference-scale-2026-11-27/README.md) for the measured diameter, evidence split and refused inputs, and [D2080](../two-view-native-draft-2026-11-27/README.md) for the saved proposal, separate editable parts, visibility, approval and native reopening. D2081 completes the orthographic review and exchange checks for that same draft.

```sh
# Node 22.19.0. Use the heavy gate for desktop execution.
node --check apps/cad-studio/test/photo-draft-step-browser.mjs
PHOTO_DRAFT_STEP_FROZEN=1 node --import "$LOCAL_PLAYWRIGHT_PRELOAD" apps/cad-studio/test/photo-draft-step-browser.mjs "$OUT/final" "$D2080_OUT/final/photo-draft-edited.bcad"
```
