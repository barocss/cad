# D1630 — Exact planar Thicken for convex quadrilateral sheets

P5, row 08, [#11](https://github.com/barocss/cad/issues/11). Base `74ba0454386a445594e82a700fdaa11f47c712f0`.

**Exact planar** now accepts a whole strictly convex coplanar degree-1 × degree-1 sheet with equal positive weights. The kernel uses the exact binary64 corner coefficients to prove coplanarity and the four positive bilinear Jacobian signs. It constructs the prism from the four-edge outline with the existing named caps and side faces. The native chart checks finite corner lengths and altitudes, profile limits and reconstruction within the native tolerance. The sampled recipe and accepted affine construction retain their existing native identity.

- **PASS, desktop Studio WebGPU.** Open a tilted non-affine trapezoid, select Exact planar, preview and apply with 4 mm symmetric thickness. Edit thickness to 6 mm, Save, then Open in a fresh context. Exact mode and the six native face names persist. A twisted source refuses Exact planar, disables Apply and leaves the document unchanged. Studio froze 1,161 files with zero source changes, page errors or console errors.
- **PASS, independent native geometry.** The plate has eight vertices, 12 edges and six planar faces. The 40 and 30 mm parallel sides have 30 mm separation, giving 1,050 mm². Native volumes 4,200.000000000005 and 6,299.999999999995 mm³ agree within 1e−8 mm³. Vertex offsets and normal thickness agree within 1e−10 mm. The reopened native digest is `f0c7647ed044c888eff48fff1078f26d9f6e743d1f0319734429077aef6ba16e`.
- **PASS, compatibility.** The sampled body retains its 73 native faces and unchanged digest. The new native inspector re-evaluates the saved D1629 file and reproduces the prior exact affine B-rep and sampled B-rep digests.
- **PASS, affected checks.** Kernel 10, Model 18, both type checks, scoped ESLint, Agent docs check, Studio build, browser syntax and Git diff. The Kernel tests cover a second convex quadrilateral and refusals of twisted, collinear, concave and crossed control nets. The Model test verifies a pinned exact Agent proposal from an edited trapezoid.
- **FAIL.** None in the completed checks.
- **NOT_RUN.** Curved or trimmed exact Thicken, downstream Boolean, WebGL2, paid live model and full local suites. #11 remains open.

Use Node 22.19.0, installed Chrome and Playwright, the heavy gate and an output directory outside the worktree.

```sh
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
node --test packages/barocss-cad/test/api-thicken.test.mjs
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir packages/barocss-cad-model test api-thicken agent-direct-thicken toolset
pnpm exec eslint packages/barocss-cad/src/{api/spec,brep/thicken-planar}.ts packages/barocss-cad/test/api-thicken.test.mjs packages/barocss-cad-model/src/chat/directThickenProposal.ts packages/barocss-cad-model/test/agent-direct-thicken-proposal.test.ts apps/cad-studio/test/exact-planar-thicken-browser.mjs
node apps/library-docs/scripts/agent-tools.mjs --check
node --check apps/cad-studio/test/exact-planar-thicken-browser.mjs
pnpm --dir apps/cad-studio build
D1630_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-planar-thicken-browser.mjs "$OUT" --trapezoid
node "$OUT/inspector.mjs" "$D1629_SAVED_FILE"
git diff --check
```
