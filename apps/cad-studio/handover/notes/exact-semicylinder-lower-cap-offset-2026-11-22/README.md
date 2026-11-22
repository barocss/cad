# D1650 — Offset the original Exact semicylinder lower cap

P5, row 31. [#17](https://github.com/barocss/cad/issues/17) and [#629](https://github.com/barocss/cad/issues/629). Base `34c3685f9f71b9e2479080fecfc54322e1de0072`.

Offset face now accepts the original lower cap of an upright, two-quarter Exact cylinder Thicken. Positive distance moves the cap along −Z and adds material. Negative distance removes material. The same native operation keeps the upper cap, cylindrical supports and all topology IDs. History stores the original lower face and the signed distance. Radial wall evidence replays the exact native result against the current solid.

- **FAIL, on base.** The new command test got `available=false` when it selected the original lower cap. The same test passes after the change.
- **PASS, focused checks.** 104 Kernel, 54 Model and 17 Studio tests. Kernel and Model type checks, Studio type check and production build, scoped ESLint, script syntax and Git diff check passed. The tests cover both axial directions, reversed V, side-face and chained Offset refusal, lower reference-plane refusal, and signed distances that reach or cross the opposite cap.
- **PASS, actual desktop Studio WebGPU.** Selected the original bottom face and dragged its normal handle from +2 to +3 mm before applying +2 mm. History refused −12 mm with Apply disabled and the accepted document intact. Applied −3 mm, then verified Undo, Redo, Save, fresh Open and the restored −3 mm field. Both upper-cap controls passed, including the existing linked reference. The lower run recorded six Studio captures, 1,168 unchanged frozen files and zero page errors, console errors or source changes.
- **PASS, native geometry and wall evidence.** The lower cap moved from Z=0 to Z=−2 mm and then to Z=3 mm. The upper cap stayed at Z=12 mm. The inner and outer radii stayed at 8 and 10 mm. The native incidence and all non-axial control coordinates match the source. Studio and native volumes match the independent half-annulus within 1e−8 mm³ and are 791.6813487046264 and 508.9380098815465 mm³. Centroid Z is 5 and 7.5 mm, respectively. The maximum edge-to-surface gap was 1.78e−15 mm. Fresh Open reproduces digest `8745b6b76cb42288c8302d021dabec92bfabbe499d08869aed27e118ea8101fa`. The Model radial-wall check returns 2 mm from the two original support names for both distances.
- **NOT_RUN.** Full local suites, WebGL2, mobile, STEP exchange and paid live models. This decision qualifies signed lower-cap distance. Lower-cap To plane is outside its scope. Both issues stay open.

Use Node 22.19.0, the heavy gate and an output directory outside Git. The desktop flows use the installed Chrome and Playwright (`CHROME`, `PW_DIR`).

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-cylinder-cap-offset,bored-cap-offset,drafted-cap-offset,api-thicken,thicken-solid}.test.mjs
pnpm --dir packages/barocss-cad type-check
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test offset-exact-cylinder-cap offset-to-plane offset-plane-retention offset-face-native agent-offset-wall agent-axial-wall
pnpm --dir packages/barocss-cad-model type-check
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test offset-plane-pick-feedback offset-face-launch-view offset-cap-feedback history-feature-apply
pnpm --dir apps/cad-studio build
D1650_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-cylinder-cap-offset-browser.mjs "$OUT/lower" --lower
D1646_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-cylinder-cap-offset-browser.mjs "$OUT/upper-signed"
D1649_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-cylinder-cap-plane-browser.mjs "$OUT/upper-plane"
git diff --check
```
