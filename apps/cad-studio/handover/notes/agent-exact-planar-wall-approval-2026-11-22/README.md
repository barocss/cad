# D1640 — Check normal wall thickness before Exact planar Thicken approval

P5, row 08. [#322](https://github.com/barocss/cad/issues/322) and [#324](https://github.com/barocss/cad/issues/324). Base `8f7eb3827a4662fadff388b4a79011e198559f63`.

Use `planar_wall` with the exact `a` and `b` names of the normal and reverse skins of one current Exact planar Thicken output. Model resolves the named faces in the current native closed solid and projects their separation onto the outward normal. The query returns millimetres and allows either name order. A side face, missing face or consumed output gives an unknown verdict.

The `requirements.check` call takes the requirement ID and the same pins as the candidate image. Studio checks the linked hard requirement again before committing. The refusal notice shows a rounded measurement only if it still fails the criterion at that precision.

- **PASS, affected checks.** 49 Model tests, Model type check, scoped ESLint, generated tool docs, browser syntax, Studio build and Git diff check. Tests cover all three offsets, reversed name order, a parallel side-face pair, a missing face, the other wall mode and a consumed output. Radial wall checks still pass. MCP lists 13 groups and uses 24,919 characters per turn.
- **PASS, actual Studio WebGPU and local MCP.** On the tilted sheet, a hard `WALL-2` requires 2 ± 0.01 mm. The 1 mm proposal measured 0.9999999999999992 mm. The Studio Accept button refused it and showed 1 mm. The document and its single history entry were identical before and after the attempt. A distinct 2 mm candidate measured 1.9999999999999998 mm and passed. Its report and image used the same model revision `a3519745e967ee18`. Moving the source sheet by +1 mm in Z invalidated both pins without returning a value. Undo restored the candidate.
- **PASS, approval and native Open.** One approval, Undo, Redo, Save and fresh Open reproduced both face names, the pass verdict and evidence revision `605b1f9d6210b1e3cf0559faedfcfa6431b68b42209e215295252df7626af8ff`. An independent calculation used the source tangents' cross product to obtain a normal of (2, 3, 6)/7 and area 1,820 mm². All eight poles of the two native skins and the eight B-rep vertices fit the two planes. Their separation was 2.0000000000000004 mm and the closed six-face solid volume was 3640.0000000000005 mm³. Native digest `9ff08c799baf9df4d01048589b91a4d52c78309b7d49a013d5ae5a55a13329cd` matched after Open. Studio checked 1,173 frozen files with zero changed sources, page errors or console errors.
- **FAIL, resolved fixture setup.** The first browser control hid the only Direct source. The summary then omitted its Direct revision, so the attempted fresh-base check had no pin. Moving the visible source produces a new pin and verifies both stale refusals.
- **NOT_RUN.** Full local suites, WebGL2, placed proposals, mobile, arbitrary planar pairs, paid live models and the separate API inventory check. Both issues remain open.

Use Node 22.19.0, installed Playwright and Chrome (`PW_DIR`, `CHROME`), the heavy gate and an output directory outside Git.

```sh
pnpm --dir packages/barocss-cad-model test agent-direct-thicken agent-direct-ruled api-thicken toolset requirement-evidence proposals
pnpm --dir packages/barocss-cad-model type-check
node apps/library-docs/scripts/agent-tools.mjs --check
node --check apps/cad-studio/test/direct-thicken-agent-proposal-browser.mjs
pnpm --dir apps/cad-studio build
D1640_SOURCE_FROZEN=1 node apps/cad-studio/test/direct-thicken-agent-proposal-browser.mjs "$OUT" --planar-wall
git diff --check
```
