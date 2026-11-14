# D1266 — Control a variable fillet radius inside a straight edge

2026-11-14 · FULL · P5, row 07 · [#2259](https://github.com/barocss/barocss/issues/2259)

In **Fillet**, select one original straight edge. Set **Radius mode** to **Varying** and **Radius controls** to **Ends and interior**. Set the interior position as a percentage from the authored start, then enter its radius. The existing shape-preserving cubic radius law interpolates the three radii. History exposes the interior position and radius. The fraction follows the current native edge when its length or height changes. The authored chord fixes the direction of the radius law.

The agent uses `run_command` with `command="fillet"`, one named straight edge, and `values={radius:1,endRadius:4,stationMode:"interior",stationAt:25,stationRadius:2}`.

- **PASS, actual desktop Studio.** On the front top edge of a 40 × 30 × 10 mm box, applied radii 1, 2 and 4 mm at 0%, 25% and 100%. Position 0% was refused with the original document intact. History changed only the interior radius to 2.5 mm. Undo and Redo restored the expected documents. Editing the box to 60 × 30 × 12 mm kept the feature and moved the 25% station from X=10 to X=15. Native Save and fresh Open restored the same B-rep.
- **PASS, independent geometry.** The Python reader used the exact piecewise Hermite polynomials and integrated their squares. For the 40 mm edge, the initial and edited integrals are 8393/27 and 761/2 mm³. Multiplication by (1 − π/4) gives the removed volume. Expected volumes were 11933.290621681288, 11918.344001172729 and 21477.516001759093 mm³. Maximum observed native volume error was below 3.5e−10 mm³. Each inspected result passed strict B-rep validation. Seven axial section planes checked both contacts and the quarter-circle diagonal, with a maximum observed residual below 1.3e−12 mm.
- **PASS, reference handling.** A substituted edge name is held on Open or refused during upstream name rematch. The added focus test exercises both paths. The Kernel resolves the percent from exact endpoints and refuses a changed support direction. Two independent reviews covered the radius law, source orientation and reference handoff.
- **PASS, affected checks.** 17 Kernel, 12 Model and 15 Studio tests passed. The Kernel, Model and Studio type-checks, code shape, changed-path lint and Studio production build passed. The frozen-position and reversed-position mutations each failed the geometry test as expected.
- **NOT_RUN.** Full suites, CI, mobile and live paid agent execution. This delivery qualifies a circular profile on one convex straight box edge. Curved, merged and tangent-expanded edges, more interior controls, shelling after a three-radius finish and topology-following through rotations remain outside the qualified scope. Older Studio builds do not interpret the fractional field. The wider fillet issue stays open.

D1267 / P5, row 24 adds a curvature-comb display for a selected native curve. Start with a straight edge and a circular arc of known radius, and verify comb magnitude and direction from their native derivatives through Studio. Keep display scale separate from measured curvature.

[Commands and receipt hashes](qualification.json).
