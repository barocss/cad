# D1273 — Vary the radius on one open circular rim

2026-11-14 · FULL · P5, row 07 · [#2259](https://github.com/barocss/barocss/issues/2259)

Select the open top rim of an extruded sector. In Edge Fillet, choose Varying and enter the two endpoint radii. On the verified 90° rim, the radius varies linearly in arc length. History edits each endpoint independently.

The former rolling-ball run crossed the radial end planes and left a one-use edge during the Boolean stitch. When a single convex circular span has a coaxial cylinder, perpendicular cap, two explicit endpoint radii and two outward radial planar ends, the tool now uses the end-plane normals for the exact endpoint tangents and ends at those planes. It uses the existing radius law, loft tolerances, swept tool and Boolean path.

- **PASS, actual desktop Studio.** On a radius-8 mm quarter-disk extruded 10 mm, clicked the original arc and applied 0.6 mm at the +X end and 1.2 mm at the +Y end. Changed only the +Y radius to 1.5 mm in History. Undo, Redo and native Save/Open restored the expected documents and geometry. Reviewed the three desktop screenshots.
- **PASS, independent geometry.** Integrated the meridian section with cylindrical Jacobian, using the square-minus-quarter-disk area and its first moment. Expected volumes were 500.4505310301965 and 499.60278298167606 mm³. Maximum observed native or worker error was 2.62e−7 mm³. Independent sections and both connected radial ends passed. Maximum Studio reader section residual was 4.69e−8 mm and end-trim residual was 1.19e−11 mm. Kernel checks sampled 25 radial sections including endpoints, also checked reversed radius order and verified the 10 mm contact refusal.
- **PASS, affected checks.** 32 focused Kernel and 10 Model tests passed. Three type checks, Kernel fast build, code shape, focused lint, driver syntax and Studio production build passed. Local stdio MCP found the same unique native rim and dry-ran the initial radius law, reporting −2.204 mm³ and preserving the file.
- **FAIL, corrected.** The baseline Studio run refused the original radius pair with a one-use Boolean edge and kept the original solid. Intermediate code shape and two test assumptions were corrected. Final Studio and focused checks passed.
- **NOT_RUN.** Full suites, CI, mobile, paid AI, public TypeScript facade admission, broader semicircular or closed rims, nonradial ends and noncircular sections. The general fillet issue remains open.

D1274 / P5, row 07 connects the verified open-rim predicate to public TypeScript `Part.fillet({endRadius})`. Retain typed selection refusals outside the supported profile. Compare the facade and Studio file with the same physical oracle.

[Commands and receipt hashes](qualification.json).
