# D1888 — Extract the Studio command Apply lifecycle

P4 [row 15](../../roadmap-rows/15.md) and [row 21](../../roadmap-rows/21.md), [#44](https://github.com/barocss/cad/issues/44). Base `60e5eaea65cb2147b5719e896977313ae781fecd`.

`useStudioCommandApply` owns accepting, deferring and retiring the current command, adopting its accepted preview, and handling asynchronous font input. App supplies document admission, selection and accepted-body ownership, the move-appearance adapter and the existing font-loader subscription. The hook keeps the existing Apply subscription cadence. App is 2663 lines and 221027 bytes, down from 2734 lines and 225411 bytes.

- **PASS, actual desktop.** Desktop Text relief at 1024 and 1440 pixels uses the same local font, blocks an outside-face result, applies the restored Text relief and verifies Undo, Redo and cancelling an invalid saved edit. Actual Extrude Join retains one solid for face contact and two for edge contact and separation. All three have 1000 mm³ native volume. The unavailable blank Distance cannot apply. Join applies its current preview and keeps Undo and Redo.
- **PASS, before/after comparison.** All ten captured states match before and after by document, bodies, selection, history and notices. Both Text relief observations and all three native Join observations match. The completed source capsules contain 666 and 1216 entries and include both App and the new hook.
- **PASS, affected checks.** 26 scoped Studio tests, focused lint and Studio production build, including TypeScript.
- **FAIL.** None in the scoped checks.
- **NOT_RUN.** Whole suites, live provider, mobile, and additional native Save/Open for this extraction. It does not qualify the full desktop usability checklist. The first mechanical CAD baseline remains 8/10. Whole product completion remains unmeasured.

## Reproduce

Use Node 22.19.0, existing desktop Chrome and Playwright and the checked-in font fixture. Run heavy checks serially and freeze the checkout during Studio.

```sh
pnpm --dir apps/cad-studio test command-apply-queue command-hud-actions font-upload history-feature-apply extrude-end-face-pick
pnpm --dir apps/cad-studio build
TEXT_RELIEF_CONTAINMENT_FROZEN=1 node apps/cad-studio/test/text-relief-containment-browser.mjs "$OUT/text"
D1155_SOURCE_FROZEN=1 node apps/cad-studio/test/extrude-join-pieces-browser.mjs "$OUT/join"
```
