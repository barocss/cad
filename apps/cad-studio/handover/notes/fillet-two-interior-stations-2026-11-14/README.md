# D1269 — Set two interior radii on a fillet

2026-11-14 · FULL · P5, row 07 · [#2259](https://github.com/barocss/barocss/issues/2259)

Select one original straight convex edge in **Fillet**. Set **Radius mode** to **Varying**, then set **Radius controls** to **Ends and two interior points**. Enter both positions in percent from the authored start and both radii in mm. Interior positions must strictly increase between the ends. History exposes both positions and radii. The two fractions follow the current edge when its size changes. The Kernel refuses concave edges and tangent continuations in this mode.

The agent discovers the inputs with `describe {command:"fillet"}`. Use `features.command` with `command:"fillet"`, the named edge, and `values:{radius:1.25,endRadius:2.5,stationMode:"two-interior",stationAt:25,stationRadius:3,station2At:62.5,station2Radius:1}`. A `features.batch` dry run can evaluate it before a change is applied.

- **PASS, actual desktop Studio.** Previewed and applied a peak of R3 at 25% and a trough of R1 at 62.5% on the front top edge of a 40 × 30 × 10 mm box. Preview left the source intact. Duplicate, crossed, endpoint and zero-radius inputs kept the part unchanged and Apply unavailable. History changed the second point to 70% and R1.5 with the first control intact. Undo and Redo restored the exact documents. On a 60 × 30 × 12 mm resize, the controls moved to X=15 and X=42 mm. Native Save and fresh Open restored the same B-rep.
- **PASS, independent geometry.** Exact integration of the three Hermite polynomials gave ∫r²dx = 27731/168 mm³ initially and 32939/168 mm³ after the edit on the 40 mm edge. Native and Studio worker volumes were within 3.0e−10 mm³ of the independent values. Strict native validation passed. The two contacts and the 45° point at four controls and three span midpoints agreed within 1.09e−12 mm. The oracle refused stale edit, reversed stations and frozen resize inputs.
- **PASS, agent and compatibility.** Local stdio MCP discovered both controls, dry-ran a volume change of −35.423 mm³ at its reported precision, and refused duplicate positions. The MCP file was byte-identical after both calls. The existing single-interior mode passed the original desktop Studio flow. Kernel tests cover reversed authored direction, malformed records, changed direction and concavity. A local native slot probe verified tangent continuation refusal.
- **PASS, affected checks.** 20 Kernel, 13 Model and 15 Studio tests passed. Kernel, Model and Studio type checks, Kernel build and code shape, focused lint, browser driver syntax and Studio production build passed.
- **FAIL.** None in the recorded delivery checks.
- **NOT_RUN.** Full suites, CI, mobile, paid AI, agent approval or commit, four-control conic and G2 sections, shell after four controls, and open in an older Studio. The new feature is qualified on one straight convex right-angle edge. The wider vertex/setback and multi-face issue remains open.

D1270 / P5, row 07 tests the four-radius fillet on one convex non-right-angle edge between a Draft wall and a cap. Use native plane and contact-circle witnesses with independent volume, and qualify creation and upstream Draft edits in Studio.

[Commands and receipt hashes](qualification.json).
