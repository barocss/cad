# D2227 — Draft both walls on a placed XY sketch

P5 [row 07](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md) · [#14](https://github.com/barocss/cad/issues/14) · Base `99f469f98`.

One original coaxial tube can use the joint Draft when its literal sketch has any of the eight exact unit cardinal XY bases. The producer reads the original world-upright stock, keeps the authored cap ownership and uses world Z for the pull and the neutral. Studio requires the two complete wall picks on the placed tube. The local Agent uses the same command route. The saved node uses the existing Draft format.

- **PASS, actual desktop.** The original Studio refused both picks on the translated tube. The new path previews both walls and Cancel preserves the source. +15° from Z20 refuses Apply when the walls would meet. With centre X−14/Y25, R12/R4 and caps Z20/Z36, +8° about Z26 measured 5,981.863171 mm³ for +Z and 6,886.100338 mm³ when History changed the pull to −Z. Both cap supports, both wall radii and the centroid agree with the independent frustum calculation. Undo, Redo and project Save → Close → reload → Open preserve the strict native result. The reopened History editor shows −Z and 26 mm.
- **PASS, affected checks.** 139 Kernel and 26 Model tests, scoped lint, Kernel/Model/Studio types, production Studio build and whitespace. Kernel tests cover signs, eight unit bases, original cap/trim identity, independent mass and area, material rays, cache and native readback. Raw near-axis, off-axis, scaled and non-XY placements do not enter this route. The local Agent selects the four original wall halves and reproduces the Studio feature.
- **FAIL, retained early attempts.** The first two focused runs each failed one expected error-category assertion on the preserved fallback. The direct probe confirmed the legacy fixed-neutral `SELECTION` message. The corrected focused matrix passes. The source-shape guard still reports the same eight entries. Script, baseline and scanned sources match the parent.
- **NOT_RUN.** Desktop on the other seven bases, arbitrary or downstream stock, exchange, full local suites, mobile and live models. #14 retains its wider acceptance. First mechanical CAD remains 8/10. Overall CAD and natural-language completion are unmeasured.

```sh
bash "$OUT/desktop.sh" before baseline
bash "$OUT/checks.sh"
node packages/barocss-cad/scripts/code-shape.mjs --check
git diff --check
```
