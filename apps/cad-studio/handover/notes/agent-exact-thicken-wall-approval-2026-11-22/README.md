# D1639 — Check a named radial wall before Exact Thicken approval

P5, row 08. [#322](https://github.com/barocss/cad/issues/322) and [#324](https://github.com/barocss/cad/issues/324). Base `1bde2fd5cd28acabf40f433e8d122ea556316d62`.

`radial_wall` takes two exact native face names, `a` and `b`, from one current Exact cylinder Thicken output. It reads the radii from the two analytic skins of the generated closed solid and reports their difference in millimetres. The output must still belong to the exact Thicken feature that generated the corresponding trimmed skins. Missing, repeated, unrelated and consumed faces return unknown.

`requirements.check` can read a requirement named by an open Exact Thicken proposal. Pass its ID as `requirement` and use the same `proposal`, `expectedProposalRevision` and `expectedDirectRevision` as the candidate image. The read returns the candidate and evidence revisions without applying the proposal. Studio checks explicitly linked hard radial wall requirements again on the output it would apply. A failed or unknown check keeps the proposal open and the document intact.

- **PASS, affected checks.** 40 Model tests, Model type check, changed TypeScript ESLint, generated agent tools page check, browser syntax check and Studio production build. The MCP catalog has 13 groups and uses 24,918 characters per turn. The value 1.999999 mm failed the exact 2 mm predicate before display rounding. Missing or invalid faces and a consumed output remained unknown.
- **PASS, local MCP and actual Studio WebGPU.** Two proposals used the same R10 semicircular rails and 12 mm span with a 2 ± 0.01 mm hard requirement. The 1 mm preview measured 1 mm. The actual Accept button showed the measured and expected values, left the proposal open, and preserved the exact document and its one history entry. The distinct 2 mm candidate measured 2 mm on `n0.normal` and `n0.reverse`, with radii 10.000000000000002 mm and 8.000000000000002 mm. Its model revision `1c78ef8346331f11` and pins matched the MCP image. The result's structured content matched the JSON text.
- **PASS, approval and native file.** A rail visibility change invalidated the candidate without returning a value. Undo restored the original. One user approval, Undo, Redo, Save and fresh Open reproduced the current evidence verdict and exact two face names. The stored acceptance and the reopened report used evidence revision `4c75abcd7759d1a7e8168fac49931f93f550dae97c61a2d962a1651016f2fd23`. The six-face solid was valid and its volume of 678.584013175393 mm³ matched the independent half-annulus calculation within 1e−9 mm³. The actual run checked 1,174 frozen files, with zero source changes, page errors or console errors.
- **FAIL, resolved setup.** The first Model type check needed explicit query narrowing. The first unknown-case test retained a pin from a different brief. The first Studio invocation lacked the installed browser environment variables and stopped before launch. The corrected commands passed.
- **FAIL, existing inventory drift.** `node apps/library-docs/scripts/api-inventory.mjs --check` reports 44 expected versus 46 actual direct `CadPartOutput` members. The two additional fields, `chamferTargets` and `filletTargets`, are both present at the base commit. The roadmap tracks inventory maintenance separately.
- **NOT_RUN.** Full local suites, WebGL2, mobile, arbitrary cylindrical face pairs, placed proposals and paid live models. Both issues remain open.

Use Node 22.19.0, installed Playwright and Chrome (`PW_DIR`, `CHROME`), the heavy gate and an output directory outside Git.

```sh
pnpm --dir packages/barocss-cad-model test agent-direct-thicken agent-direct-ruled toolset requirement-evidence proposals
pnpm --dir packages/barocss-cad-model type-check
node apps/library-docs/scripts/agent-tools.mjs --check
node --check apps/cad-studio/test/direct-thicken-agent-proposal-browser.mjs
pnpm --dir apps/cad-studio build
D1639_SOURCE_FROZEN=1 node apps/cad-studio/test/direct-thicken-agent-proposal-browser.mjs "$OUT" --radial-wall
git diff --check
```
