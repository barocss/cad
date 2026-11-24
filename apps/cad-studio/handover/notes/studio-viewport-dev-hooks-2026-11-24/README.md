# D1873 — Separate the Studio viewport's development probes

P4 [row 15](../../roadmap-rows/15.md), [row 20](../../roadmap-rows/20.md), [#44](https://github.com/barocss/cad/issues/44). Base `40307861ef49d91c790a306a76778db9bea45854`.

Move the development-only document, body, selection, camera projection and cage probes out of `App.tsx` into a viewport hook. Named face and edge probes use the current body list. Forwarded picks use the current viewport handler. The App drops from 2,799 to 2,757 lines.

- **PASS, actual Chrome desktop.** A real Top face click matches the named helpers. Named selection and additive native edge routing pick two distinct edges. The Box chain stops at its right-angle corner. New part retires the old face and edge names. After Save and fresh Open, the same actual face click and 7,680 mm³ body return. Six states and no page, console or source-change errors.
- **PASS, affected SubD control.** Real cage selection in Box and Smooth at 1024 and 1440 desktop widths reports the four-edge loop, the filled face and restored selections through Undo and Redo. The edited cage saves and reopens. Thirteen states. The later type-only correction emits byte-identical JavaScript.
- **PASS, affected checks.** 64 Studio tests, Studio type check and build, scoped lint, syntax and diff check. The six moved selection and projection names are absent from emitted production JavaScript.
- **FAIL, first checks.** The initial desktop harness compared floating-point mass at exact integer precision. The actual value was `7680.000000000003` mm³. The corrected physical comparison uses `1e-8` mm³ and the reopened value still compares exactly. The first type check rejected the required-property cast on `Window`. The probes now use a partial development window type.
- **NOT_RUN.** Other backends, other cage families, mobile and full local suites. No additional parent checklist entry is closed. First mechanical CAD remains 8/10. Whole-product completion remains unmeasured.

```sh
D1873_SOURCE_FROZEN=1 node --import "$PLAYWRIGHT_LOCAL_ONLY" apps/cad-studio/test/viewport-dev-hooks-browser.mjs "$OUT/viewport-typed"
D1324_SOURCE_FROZEN=1 node --import "$PLAYWRIGHT_LOCAL_ONLY" apps/cad-studio/test/cage-selection-mode-browser.mjs "$OUT/cage"
pnpm --dir apps/cad-studio test pick cage model-rail
pnpm --dir apps/cad-studio type-check
pnpm --dir apps/cad-studio build
git diff --check
```
