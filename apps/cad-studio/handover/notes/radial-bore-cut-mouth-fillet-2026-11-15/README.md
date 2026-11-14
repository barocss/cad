# D1307 — Fillet the new bore mouth on the radial cut cap

2026-11-15 · FEATURE qualification · P5, rows 07 and 30

The existing native fillet can round the new bore mouth made by the D1301 radial Intersect. The start cap retains its original trim. The test uses the untouched cut as a reference and checks the new blend geometry in the 45° cut frame.

- **PASS — desktop Studio WebGPU.** Used the Back Left view and clicked the new cut rim. The Fillet HUD reported both native half-edge names on `n3.bottom`. A 10 mm radius was refused with Apply disabled and the document preserved. A 0.20 mm Fillet applied and History accepted 0.25 mm. Undo, Redo, Save, fresh Open and local MCP readback passed.
- **PASS — native geometry.** Both results are strict genus-1 solids. The new cut cap keeps five outer edges and has ten or eight cubic inner edges paired with the blend. All six original start-cap edge names and 17 XYZ samples per edge match the unfilleted input exactly. The maximum sampled residual was 4.86e-8 mm at the new contact and 1.34e-14 mm at the retained cap. The maximum strict edge-to-surface gap was 3.89e-8 mm. Reflection in the bend's 22.5° bisector maps the D1305 removal to this end. Native volume of 2140.729855266 or 2140.697185027 mm³ agrees with the independent Pappus and rolling-ball calculation to within 4.65e-8 mm³. Local MCP returned 2140.697 mm³ after reopen.
- **PASS — scoped lint and whitespace.** This delivery adds a repeatable desktop regression through the existing native fillet command.
- **NOT_RUN.** Local production rebuild for this test-only change, fillets at both ends in the same part, other cut angles and profiles, WebGL2, mobile, hosted inference and full local suites. The broader [Sweep issue](https://github.com/barocss/cad/issues/10) remains open.

## Commands and evidence

Node 22.19.0. The heavy gate serialized the desktop run. All 908 frozen sources matched after cleanup. No page errors, console errors or worktree changes were recorded.

Receipt SHA-256 `caaf19cf56560d82175b13b791379eb2a4a8e718bfb0b16687eb52179c54836e`. Native Save SHA-256 `4840e8e50822cdaa94bddc02d6d42697070eeddd1d1b9cedc0d126009193980e`.

```sh
D1307_SOURCE_FROZEN=1 node apps/cad-studio/test/arc-bore-radial-mouth-fillet-browser.mjs <external-evidence>
pnpm exec eslint apps/cad-studio/test/arc-bore-radial-mouth-fillet-browser.mjs
git diff --check
```
