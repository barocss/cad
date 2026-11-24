# D1973 — Move an axis Section through an original vertex

P4 [row 5](../../roadmap-rows/05.md) and [row 20](../../roadmap-rows/20.md). [#272](https://github.com/barocss/cad/issues/272). Base `487c76326ab305018b1f9370740526795d8a02cd`.

A single exact axis Section can move through one visible original endpoint of a retained native straight edge on a base body. The visible pointer witness and section edge map identify the exact source vertex. Studio checks the prospective section in the existing worker, then retains the old plane until Apply. The move keeps the plane normal and kept side, and uses the source coordinate in millimetres without drag quantization. The section remains session state.

- **FAIL, previous desktop capability.** The previous Studio has no vertex move action. Clicking an original corner leaves the X30 plane unchanged.
- **PASS, actual desktop WebGPU and WebGL2.** An L-profile Extrude keeps 7525 mm³ at X30. A generated cap corner refuses. The original visible vertex at (37.375, 30, 10) previews X37.375 and leaves the original section in place. Cancel, Escape and a plane flip retire their candidates. Apply keeps the +X normal and produces 6787.5 mm³. The exact offset and retained volume agree in both backends. Document, History and selection are identical before and after. WebGPU native Save and fresh Open recover the original 10525 mm³ L body with no active section.
- **PASS, retained behavior.** Actual WebGPU face-derived section still refuses its generated cap, commits the original face, flips and returns to an axis plane. Focused vertex witness checks reject cloned data, a different mesh and changed body or coordinate.
- **PASS, affected checks.** 21 Studio checks, Studio types and production build, scoped ESLint and diff check.
- **Corrected during verification.** The first desktop candidate used the corner touching a shortened edge. That pick correctly lacked a full retained-edge witness. The supported corner is on fully retained original edges. The first WebGL2 run reached the fallback renderer but the browser harness waited for a WebGPU selector. The first Studio type check inferred a literal `false` for an action ref. The initial focused test invocation ran from the repository root and two fixture-relative reads failed. Final checks use the requested backend, typed action ref and Studio working directory.
- **NOT_RUN.** Oblique vertex moves, unconfirmed display endpoints, multi-plane modes, occurrences, full local suites and mobile. #272 remains open. First mechanical CAD is 8/10. Overall CAD is unmeasured.

The independent section oracle is the planar area times 10 mm. At X30 the kept area is `30 × 10 + 22.625 × 20`. At X37.375 it is `22.625 × 30`. The full L area is `60 × 10 + 22.625 × 20`.

```sh
D1973_SOURCE_FROZEN=1 node apps/cad-studio/test/section-through-vertex-browser.mjs "$OUT/prior" --baseline
D1973_SOURCE_FROZEN=1 node apps/cad-studio/test/section-through-vertex-browser.mjs "$OUT/webgpu"
D1973_SOURCE_FROZEN=1 node apps/cad-studio/test/section-through-vertex-browser.mjs "$OUT/webgl" --webgl
D1012_SOURCE_FROZEN=1 node apps/cad-studio/test/section-face-position-browser.mjs "$OUT/face-control"
pnpm --dir apps/cad-studio test section-planes section-view vertex-pick-filter mesh-circle-pick section-exclusion-session
pnpm --dir apps/cad-studio build
git diff --check
```
