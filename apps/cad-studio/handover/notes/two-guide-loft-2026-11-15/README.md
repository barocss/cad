# D1275 — Loft between two independently editable guides

2026-11-15 · FEATURE · P5, row 07

Studio Loft can copy two quadratic Bézier guides onto different corners of two congruent, axis-aligned rectangles facing +Z. Use the two minimum-Y corners in order from minimum X to maximum X. Each guide starts at the lower section, ends at the upper section, and has its middle control at the midpoint in Z. A positive X gap between the middle controls keeps all intermediate sections regular. The four native side patches have degree 1 across the section and degree 2 along the guides. History edits the middle X and Y of either copied guide independently.

- **PASS — desktop Studio.** Selected the upper sketch first and the lower sketch second. Selected an invalid second guide and saw a corner-specific refusal. Apply remained disabled and the document was unchanged. Selected the valid second guide and applied the Loft. Changed the first guide alone, undid the change, then changed the second guide alone. Undo and Redo restored the expected docs. Native Save and fresh Open restored identical geometry. Reviewed the refusal, original, both edits, and reopened WebGPU scenes.
- **PASS — independent geometry.** The 10 × 6 mm sections are 12 mm apart. For middle X offsets `a` and `b` and `c = (b - a) / 10`, integration of the rectangular slices gives `V = 720 × (1 + 2c/3 + 2c²/15) mm³`. The expected volumes for the original, first-guide edit, and second-guide edit were 819.84, 768.96, and 927.36 mm³. Maximum error was below `3e-13 mm³` for both the native provider and the Studio worker. The two authored curves remained exact edges with two incident uses each. Sampled both rails and four native side patches at five heights against the independent slice coordinates. Strict B-rep checks reported one closed solid with 6 faces and 12 edges in every state. Kernel coverage also checked a change in guide Y, translated sections, and malformed or crossing controls.
- **PASS — regressions.** 97 Kernel and 23 Model Loft tests, both package type checks, the Kernel fast build, the Studio production build, code shape, and focused lint. Existing Studio flows D1170 and D1171 passed for unguided and single-guide Loft.
- **FAIL — docs aggregate.** The generated API inventory still reports `IV001` at `$.coreResultChecks[0].directMembers.length` (44 expected, 46 actual). The generated refusal reference has other pre-existing drift. The D1275 refusal example is present in the reference. The initial focused lint rejected a sparse array literal in the negative test. Creating the deliberate hole explicitly resolved it, and reruns passed.
- **NOT_RUN.** Full local suites, mobile, paid AI, interoperability export, nonrectangular sections, other section frames, and broader rail types. The source curves are independent snapshots. D1276 covers local agent proposal and Studio approval for this profile.

## Commands and evidence

Node 22.19.0. The gate serialized the heavy runs. The Studio run covered a frozen 903-file source capsule with zero unexpected page, console, or source changes. Receipt SHA-256 `5bc7b2321d9bfcfb0fe0587413b625c3b8ab4de26d42ff6b39ff0f134a6398eb`. The saved `.bcad` SHA-256 was `ce198c3aaafffc49acde2f1b44460e94da9abd4798bbb4826ae1308a5179cf3f`. The second edit and reopened native inspection both produced SHA-256 `c27370a43211d61b9f9a5163d54d11a43af245087f1c3ff9f07c584c380b5cb1`.

```sh
pnpm --filter @barocss/cad type-check
(cd packages/barocss-cad && node scripts/tool.mjs build:fast)
(cd packages/barocss-cad && node --test --test-concurrency=1 test/loft-{two-guides,nurbs-guide,cubic-guide,guide-control-range,multi-conic}.test.mjs test/oriented-loft.test.mjs)
pnpm --filter @barocss/cad-model type-check
TEST_CONCURRENCY=1 pnpm --filter @barocss/cad-model test loft
pnpm --filter @barocss/cad-studio-app build --outDir <external-evidence>
D1275_SOURCE_FROZEN=1 node apps/cad-studio/test/loft-two-guides-browser.mjs <external-evidence>
D1170_SOURCE_FROZEN=1 node apps/cad-studio/test/loft-two-section-mode-browser.mjs <external-evidence>
D1171_SOURCE_FROZEN=1 node apps/cad-studio/test/loft-history-guide-replacement-browser.mjs <external-evidence>
node packages/barocss-cad/scripts/code-shape.mjs --check
pnpm --filter @barocss/library-docs check:docs
git diff --check
```
