# D2123 — Open the lower hemisphere of an exact capsule Shell

P5 [row 07](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md) · [#13](https://github.com/barocss/cad/issues/13) · Base `01899646846c5ced4376246b4c4e248fb86918a1`.

Uniform Shell accepts the complete original lower hemisphere of the canonical full capsule Revolve. The new meridian starts clockwise so the arc radius is measured from the inner equator. The shared profile normalization preserves that radius and orders the inner hemisphere, inner barrel, annular rim, outer barrel and upper hemisphere. The original lower face reference owns the feature. The retained native chart names and their geometry map to the original barrel and upper hemisphere.

- **FAIL, reproduced base behavior.** Actual desktop Studio selects the lower hemisphere as one face. Shell refuses with `only straight walls can be left open (side0)`. Cancel retains the two original nodes and their solid.
- **PASS, actual desktop.** In both lower- and upper-opening flows, the chosen face previews, cancels, previews again and applies. History refuses a 10 mm wall that would reach the axis. The accepted 2 mm edit, Undo, Redo, Save and fresh Open reproduce the same result. The lower native reopen digest is `36168f5813799105e02699663d72773e69e33cefdce764ad6928e7c425545d1c`. The lower rim's four bounded curves per chart lie on Y = 0 and its outward normal points along negative Y. All three runs freeze 1,271 source files with zero source changes, runtime errors or console errors.
- **PASS, independent native geometry.** For outer radius 10 mm, barrel length 40 mm and inner radius `r = 10 − wall`, the material volume is `π · [40 · (100 − r²) + 2 · (1000 − r³)/3]`. The axial moment for the upper opening is `π · [800 · (100 − r²) − (10000 − r⁴)/4]`. Reflect that centroid along Y through Y = 20 for the lower opening. The 1 and 2 mm walls give 2,955.191489476799 and 5,545.958231137181 mm³ with the lower-opening centroids Y = 24.755226789510985 and 24.52190332326284 mm. Both native and Worker mass agree with these values. Strict checks give one solid, one shell, genus zero, ten faces, ten loops, 36 coedges, 18 edges and ten vertices. Native controls measure 1.2 mm as well and compare the retained supports, curve control points, tagged cyclic and reversed profiles. Three upper-opening native digests match the pinned baseline.
- **PASS, affected checks.** 88 Kernel, 9 Model and 31 Studio tests, restored upper-only producer mutation, Kernel/Model/Studio types, scoped ESLint, driver syntax, Studio production build and diff check on Node 22.19.0. The mutation reintroduces the lower opening refusal.
- **FAIL, corrected assertion.** The first extended test compared full surface objects and treated each new Shell-owned surface ID as an error. The corrected test compares the named geometry records after removing each surface ID.
- **NOT_RUN.** Opening both hemispheres, legacy readers, full local suites, broader freeform Shells, STEP, mobile, and live providers. The remaining [#13](https://github.com/barocss/cad/issues/13) acceptance is open. First mechanical CAD stays at 8/10. Whole CAD completion remains unmeasured.

```sh
# Node 22.19.0. Use the heavy gate and freeze sources while Chrome runs.
CAPSULE_SHELL_SOURCE_FROZEN=1 node apps/cad-studio/test/capsule-shell-browser.mjs "$OUT/baseline" --lower --baseline
node packages/barocss-cad/scripts/tool.mjs build:fast
CAPSULE_SHELL_SOURCE_FROZEN=1 node apps/cad-studio/test/capsule-shell-browser.mjs "$OUT/lower" --lower
CAPSULE_SHELL_SOURCE_FROZEN=1 node apps/cad-studio/test/capsule-shell-browser.mjs "$OUT/upper"
node --test --test-concurrency=1 packages/barocss-cad/test/{capsule-shell,part-model,r11-s0,r11-1,r11-1b,r11-1c,part-closed-l-shell-join}.test.mjs
pnpm --dir packages/barocss-cad-model test shell-opening-history shell-walls
pnpm --dir apps/cad-studio test shell-opening-history
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
git diff --check
```
