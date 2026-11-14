# D1270 — Fillet the rim of an inclined Draft wall

2026-11-14 · FEATURE · P5, row 07 · [#2259](https://github.com/barocss/barocss/issues/2259)

The Fillet command accepts fractional radius controls on an exact straight edge between two unmerged native planes of a single closed polyhedral Boolean solid. The Model checks both display endpoints against the ordered B-rep vertices and the exact linear curve. It clears the witness when edges merge or a body is placed. The prism-only endpoint witness for other tools remains separate. The Kernel still decides whether the finish itself is valid.

- **PASS, actual desktop Studio.** Applied 8° Draft to the front wall of a 40 × 30 × 10 mm solid. Selected its top rim and added radii 1.25, 3, 1 and 2.5 mm at 0%, 25%, 62.5% and 100% from the native start at X=40. Edited the same Draft to 12° in History. The fillet retained the authored edge name, endpoints and fractions. Undo, Redo, native Save and fresh Open reconstructed the expected states. The three inspected desktop screenshots showed the applied and reopened part.
- **PASS, independent geometry.** At 8° and 12°, the wall and cap form 98° and 102° interior angles. The Python oracle checked the two support planes, both contacts and their tangent normals, the section bisector and circle radius at seven axial stations. The largest contact or arc residual was below 3.67e−11 mm. The oracle integrated the exact radius law against the sector coefficient tan(β/2) − β/2, where β is the turn between outward normals. Expected volumes were 11693.547478948258 and 11553.575995204126 mm³. Maximum native or Studio worker volume error was below 1.0e−10 mm³. Strict native validation passed. The oracle rejected stale angle, wrong contact normal and wrong arc inputs.
- **PASS, affected checks.** 15 focused Model tests, Model and Studio type checks, focused lint, driver syntax and Studio production build passed. The agent dispatcher used the same native edge and produced the same geometry. The Model test also confirms that a placed copy loses the finish witness.
- **FAIL, corrected.** The first Studio run selected the right rim but showed no radius controls. A second attempt still missed the source family. The confirmed producer is a polyhedral Boolean. The final Studio run passed.
- **FAIL, retained as next work.** A separate source probe on four-wall Draft Extrude with the same stock and radii passed at 8° and failed at 12° in the final analytic Boolean stitch. The latter reports a top-rim edge with one use. Inclined end-face trims introduce additional removal beyond the projected cap rim.
- **NOT_RUN.** Full suites, CI, mobile, paid live AI, a new local MCP replay, four-wall desktop Studio, and conic or G2 sections. The general fillet issue remains open.

D1271 / P5, row 07 starts with the reproduced four-wall 12° Draft Extrude failure. Preserve the 8° case. Check the two inclined end trims, their contacts and the added removal with an independent volume calculation. Verify the resulting shape in actual Studio.

[Commands and receipt hashes](qualification.json).
