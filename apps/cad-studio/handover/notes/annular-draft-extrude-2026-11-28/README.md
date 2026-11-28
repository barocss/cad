# D2228 — Draft both walls in the original annular Extrude

P5 [row 07](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md) · [#14](https://github.com/barocss/cad/issues/14) · Base `9ceacb216`.

The original Extrude accepts a signed Draft on a literal unplaced XY circle with one intrinsic coaxial full-circle hole and positive literal distance. The shared annular producer builds both walls about the original start cap in one feature. It preserves the native wall owners, cap stations and both loop trims. The angle must be greater than −45° and less than 45°. Zero keeps the original straight extrusion. The Extrude editor associates joint contact, bore-axis collapse and the angle limit with Draft.

- **PASS, actual desktop.** The old Extrude refused 8° on the native annular sketch. The revised new Extrude previews at 8°, Cancel keeps the sketch, and Apply adds one feature. The original Extrude History accepts +8° and −8° at Z3–Z19. The +15° contact attempt shows the Draft-field refusal and preserves the accepted part. The R12/R4 fixture measures 4,625.507422 mm³ at +8° and 8,242.456087 mm³ at −8°. Independent radial sections, both supports, strict native topology and centroid agree. Undo, Redo and project Save → Close → reload → Open preserve the result. The new extrusion starts at Z0 and keeps the same +8° volume.
- **PASS, affected checks.** 94 Kernel, 27 Model and 7 Studio tests, scoped lint, affected types, production Studio build and whitespace. Kernel coverage includes both angle signs, start station and default, cap coefficients, native ownership, material rays, independent area and mass, cold and cached edits and native reload. Zero-draft and other profile controls pass.
- **FAIL, retained early attempts.** The baseline driver waited on an unopened diagnostic disclosure. Opening it completed the reproduction. The first revised driver verified the full History and reopen path and then tried a missing data attribute on an unconsumed sketch. The accessible History button completed the independent new-Extrude suffix with the same frozen source hashes. The initial Kernel type check found two untyped numeric uses. The corrected types emit identical runtime JavaScript, and both actual desktop paths pass together on the final source. The existing source-shape guard retains its eight entries.
- **NOT_RUN.** Placed and negative-height Extrude, nonliteral annular dimensions, other hole profiles, exchange, full local suites, mobile and live providers. #14 keeps its broader acceptance. The first mechanical CAD baseline remains 8/10. Overall CAD and natural-language completion are unmeasured.

```sh
bash "$OUT/desktop.sh" before-with-detail baseline
bash "$OUT/checks.sh"
bash "$OUT/continue.sh"
bash "$OUT/final.sh"
node packages/barocss-cad/scripts/code-shape.mjs --check
git diff --check
```
