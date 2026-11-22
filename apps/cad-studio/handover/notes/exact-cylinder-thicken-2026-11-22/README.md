# D1632 — Exact Thicken for an upright quarter-cylinder

P5, row 08, [#11](https://github.com/barocss/cad/issues/11) and [#368](https://github.com/barocss/cad/issues/368). Base `b8c88a2fbc237931081937723e3f387bc2bbbe7f`.

Studio, the Part API and the local agent proposal accept an opt-in Exact cylinder mode. The kernel admits a whole untrimmed upright patch with one canonical rational quadratic quarter arc and one linear Z span. It checks the radial vectors on the stored coordinates and constructs two analytic cylindrical walls, two radial end walls and two annular-sector caps. U and V reversals retain source-relative face names and normal direction. The sampled default and Exact planar path remain available.

- **PASS, affected checks.** Kernel API 12/12 and Model 19/19. Both package type checks, kernel build, Studio build, scoped ESLint, browser syntax, generated agent tools check and Git diff check passed. Kernel coverage includes normal, reverse, both, U and V reversal, noncanonical inputs and axis collapse. Model checks cover BCAD reconstruction and raw feature admission.
- **PASS, desktop Studio WebGPU.** Open a rotated-in-XY R10 patch with height 12 mm. Reverse Thicken at 10 mm disables Apply and preserves the input document. Preview and apply at 2 mm, edit to 3 mm in history, save and open in a fresh context. Review the actual refusal, preview and reopened result. Source files checked: 1,162. Worktree changes, page errors and console errors: zero.
- **PASS, native B-rep and independent volume.** One strict closed solid, genus 0, 8 vertices, 12 edges and 6 faces. Outer radius 10 mm, inner radius 8 then 7 mm. Studio and native volume match π × 12 × (10² − inner radius²) ÷ 4 within 1e−7 mm³. Native values: 339.2920065876972 and 480.66367599923797 mm³. Face names and source geometry persist across the edit. Fresh Open reproduces native digest `362669c0002dc692e5a6278d56f95f13bc71f482312c0d80d043aee7d5ed032a`.
- **FAIL, initial launch setup.** The first Studio command omitted the installed Playwright and Chrome paths. It stopped before opening the browser. The corrected command completed the flow once.
- **NOT_RUN.** Full local suites, WebGL2, paid live models, tilted axes, non-quarter or multiple spans and trimmed inputs. The linked issues remain open.

Use Node 22.19.0, set `PW_DIR` and `CHROME` to the installed desktop tools, acquire the heavy gate and set `OUT` to an output directory outside the worktree.

```sh
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
node --test packages/barocss-cad/test/api-thicken.test.mjs
pnpm --dir packages/barocss-cad-model test api-thicken agent-direct-thicken toolset
node apps/library-docs/scripts/agent-tools.mjs --check
node --check apps/cad-studio/test/exact-cylinder-thicken-browser.mjs
pnpm --dir apps/cad-studio build
D1632_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-cylinder-thicken-browser.mjs "$OUT"
git diff --check
```
