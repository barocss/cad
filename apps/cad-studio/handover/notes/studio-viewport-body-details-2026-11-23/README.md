# D1707 — Extract viewport body details from Studio App

P4 Studio structure, row 22. [Desktop verification index #44](https://github.com/barocss/cad/issues/44). Base `6b58d0b4470a4db58e17bb718dab34ebb88b469d`.

Move cosmetic thread lines, placed-body appearance, CPU section hatching and assembly-step visibility to `useViewportBodyDetails`. App still owns document and session state and passes the prepared output to the existing viewport. The memo dependency boundaries and the order of the display operations follow the original code. App decreases from 3308 to 3286 lines.

## Verification

- **FAIL, obsolete baseline driver.** `assembly-step-authoring-baseline-browser.mjs` still expects `describe` to omit all authoring actions. The exact base already advertises the supported step action, so the assertion stops before display verification. The current assembly Steps flow checks the rendered occurrence visibility and comparison independently of that assertion.
- **PASS, actual desktop Studio before and after.** The four selected flows match across 50 complete state checkpoints and all recorded observations. The saved files match byte for byte at eight checkpoints. Six independent oracle inputs and outputs and two native thread readbacks also match. The comparator resolves each receipt's evidence paths relative to its own directory. No page or console errors and no source changes occurred in the eight browser runs.
- **PASS, viewport images.** In each of four desktop captures, the 800 × 590 pixel region at X = 240, Y = 160 has zero changed RGB pixels. The selected scenes show the CPU section exclusion, an assembly step, a blue occurrence override and cosmetic thread lines.
- **PASS, affected checks.** 29 Studio tests, scoped ESLint, production Studio build with type checking and Git diff check.
- **NOT_RUN.** Full local suites, native WebGL2, mobile and new rendering-quality work. The CPU section case uses the existing test hook inside the WebGPU desktop viewport. First mechanical CAD remains 8/10 and overall completion is unmeasured.

| Desktop flow | Matching state checkpoints | Matching native files |
| --- | ---: | ---: |
| Selective section | 18 | 1 |
| Assembly steps | 21 | 5 |
| Occurrence appearance | 6 | 1 |
| Tapped-hole History | 5 | 1 |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and separate external directories for the base and candidate. Compare the complete `states` and `observations` objects and the native file hashes. Compare the raw oracle input and output files. For the pixel check, decode the named PNGs and compare RGB in the recorded rectangle.

```sh
SECTION_SELECTIVE_FROZEN=1 node apps/cad-studio/test/section-selective-instance-browser.mjs "$OUT/section"
ASSEMBLY_STEPS_SOURCE_FROZEN=1 node apps/cad-studio/test/assembly-steps-browser.mjs "$OUT/steps"
INSTANCE_LOOKS_SOURCE_FROZEN=1 node apps/cad-studio/test/instance-looks-browser.mjs "$OUT/looks"
TAPPED_THREAD_HISTORY_FROZEN=1 node apps/cad-studio/test/tapped-hole-thread-history-browser.mjs "$OUT/thread"
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test assembly-steps assembly-step-member-selection instance-looks section-display viewport-display-policy
pnpm exec eslint apps/cad-studio/src/{App.tsx,state/useViewportBodyDetails.ts}
pnpm --dir apps/cad-studio build
git diff --check
```

The four checked images are `cpu-forced-p2-excluded.png`, `11-replay-sequential.png`, `03-cube2-blue-steel.png` and `02-applied.png` in their respective flow directories.
