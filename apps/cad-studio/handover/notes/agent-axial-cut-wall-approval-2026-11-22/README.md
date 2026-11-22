# D1642 — Verify the radial wall after an axial Subtract

P5, row 08. [#175](https://github.com/barocss/cad/issues/175) and [#322](https://github.com/barocss/cad/issues/322). Base `e131710a522a40528b510ad989f4c56bf51012bb`.

`radial_wall` accepts the two named native cylindrical skins after a single full axial-end Subtract from Exact cylinder Thicken. The check reads the resolved native inputs and verifies that the rectangular cutter strictly covers the original rim control hull in XY and crosses one axial end. The current closed solid must retain both cylindrical supports and the original end plane, and have the expected new plane. A partial or ineffective cutter leaves the check unknown even when both face names survive. The existing hard requirement gate checks the actual replay before approval.

- **PASS, affected checks.** 41 Model tests, Model type check, scoped ESLint, agent tools documentation, browser syntax, Studio build and Git diff. The native probe and tests cover both axial ends, a cutter positioned by a parameter, and the partial and ineffective cutters. The Model tests confirm that both original cylinder names survive on the two negative outputs.
- **PASS, local MCP and actual Studio WebGPU.** A partial cutter proposal reached preview and then failed the hard `RADIAL-2` approval check. Studio kept its document and history intact. The full cutter passed the same 2 ± 0.01 mm requirement and one user approval applied it. The acceptance and MCP evidence shared revision `bc9b403cabded881232c568a0ab8d0513fad69c567ea2974568146b71f6058cb`.
- **PASS, edit and native Open.** Edited the cut plane from Z = 8 to 6 mm, then exercised Undo, Redo, Save and fresh Open. The earlier report pin refused after the edit. The reopened current report used revision `eeabdf9e294ab8aba2f0e6738d32a5f104d405f8ec1d82b26d8154912b98a2fe`, with the same two face names and measured value of 1.9999999999999964 mm. Studio showed a passing requirement. Independent geometry checks reproduced the 10 mm and 8 mm radii, the Z = 6 mm cap, and volume 339.2920065876959 mm³. The native B-rep digest matches D1641. The flow checked 1,167 frozen files with zero source changes, page errors or console errors.
- **FAIL.** None in the selected verification.
- **NOT_RUN.** Full local suites, WebGL2, paid live models and general Boolean wall thickness. A cutter whose footprint cannot be certified from the whole native rim hull remains unknown. The linked issues remain open.

Use Node 22.19.0, installed Playwright and Chrome (`PW_DIR`, `CHROME`), the heavy gate and an output directory outside Git.

```sh
pnpm --dir packages/barocss-cad-model test agent-axial-wall agent-direct-thicken toolset requirement-evidence proposals
pnpm --dir packages/barocss-cad-model type-check
node apps/library-docs/scripts/agent-tools.mjs --check
node --check apps/cad-studio/test/exact-cylinder-axial-cut-browser.mjs
pnpm --dir apps/cad-studio build
D1642_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-cylinder-axial-cut-browser.mjs "$OUT" --wall-check
git diff --check
```
