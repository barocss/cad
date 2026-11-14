# D1271 — Preserve short fillet contacts on tapered extrusions

2026-11-14 · FULL · P5, row 07 · [#2259](https://github.com/barocss/barocss/issues/2259)

A 12° four-wall Draft Extrude exposed a missing planar contact cut in the fillet's Boolean subtraction. The last loft patch overlapped the cap near one end. All three interior samples missed the overlap, so the Boolean kept the untrimmed cap and the original rim had only one edge use. The Boolean now checks overlap intervals before discarding such planar contact cuts. The arrangement still clips the original curve. The change does not alter the stitch tolerance.

Studio admits exact, unmerged planar edges of drafted extrusions to the existing fractional-radius controls. The Kernel determines whether the finish can complete.

- **PASS, actual desktop Studio.** On a 40 × 30 × 10 mm rectangular extrusion, authored four-wall 8° Draft and applied a circular fillet at the front top rim. The radius controls were 1.25, 3, 1 and 2.5 mm at 0%, 25%, 62.5% and 100%. Edited Draft to 12° in History with both fractional controls and the exact rim name retained. Undo, Redo, native Save and fresh Open reproduced the same states. Reviewed three product screenshots.
- **PASS, independent geometry.** Verified all six support planes, seven rolling-circle sections and both connected native end trim chains. The inclined ends contributed 0.072099887981 mm³ combined removal at 8° and 0.083789514241 mm³ at 12°. Expected finished volumes were 11018.889660840567 and 10553.214670395955 mm³. Maximum native or worker volume error was below 4.2e−9 mm³. The largest section contact residual was below 9.31e−7 mm and the largest sampled end trim residual was below 9.35e−8 mm. Strict B-rep validation passed. The independent checks detected omitted end volume, swapped trims and a missing trim.
- **PASS, affected paths.** 30 focused Kernel tests and 16 focused Model tests passed. Kernel fast build and code shape, three type checks, focused lint, driver syntax and Studio production build passed. The Model check covers direct command dispatch and upstream reference retention. Source-bundled checks also confirmed the 12° result when the authored radius order was reversed.
- **FAIL, resolved.** Before the fix, the 12° edit was refused with the 8° document intact. The baseline driver initially waited for a toast while History displayed the refusal inline. A first Model type check also refused the narrow test fixture input type. Final checks passed.
- **NOT_RUN.** Full suites, CI, mobile, paid AI, local MCP replay, placed and nonrectangular tapers, noncircular sections, and the remaining general fillet issue.

D1272 / P5, row 07 uses the tapered fillet through a local agent proposal. Verify exact native edge discovery, proposal preview and user approval in actual Studio, with radius controls preserved on reopen.

[Commands and receipt hashes](qualification.json).
