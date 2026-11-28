# D2217 — Set an independent ceiling on an original bottom-open L Shell

P5 [row 07](../../roadmap-rows/07.md), [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md) · [#13](https://github.com/barocss/cad/issues/13) · Base `36ab8be6b`.

Separate ceiling is available on the exact original bottom cap of a zero-draft upright orthogonal L extrusion. The current schema stores an optional literal `ceilingThickness`. It is separate from the existing top-open `floorThickness`. The revision-pinned local Agent command requires the exact original bottom face. Native geometry keeps the original supports and bottom opening and sets the upper end of the cavity independently of the wall offset. Default Round, explicit Round and Sharp use the supported exact profiles.

- **PASS, actual desktop.** The baseline Studio only offered 2 mm uniform thickness at the original bottom. Its inner ceiling was Z18 and native volume was 6,464.548668 mm³. The revised 40 × 30 × 20 mm L previewed Sharp with 2 mm walls and a 3 mm ceiling. Cancel kept the original. A 20 mm ceiling refused Apply. The accepted Sharp result had a bottom rim at Z0 and inner ceiling at Z17, with 7,080 mm³. History edited the ceiling to 5 mm at Z15 and kept the bottom opening. The 5 mm part was 8,280 mm³ for Sharp and 8,267.123890 mm³ for Round. Undo, Redo and project Save → Close → reload → Open restored the expected documents. The existing top-open floor and corner desktop flow also passed.
- **PASS, native and affected checks.** 53 Kernel, 20 Model and 16 Studio focused tests. Independent volumes, area, centroid, material rays, trims and supports agree. Reversed, reflected, tagged and nonzero-start stock pass. Mixed cap fields, wrong openings, unsupported stock and collapse refuse. The previous top-open and uniform paths pass their controls. Kernel, Model and Studio types, scoped lint, whitespace and the production Studio bundle passed.
- **FAIL, first test assertion.** The Round case initially used an exact internal wall name and missed its numbered planar fragment. The passing test resolves the name stem on the planar support and verifies the separate cylinder.
- **NOT_RUN.** Other L ancestries or opening sets, general freeform Shell, full local suites and mobile. #13 remains open for its broader acceptance. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
bash "$OUT/checks.sh"
bash "$OUT/run.sh" desktop-before
bash "$OUT/desktop-checks.sh"
git diff --check
```
