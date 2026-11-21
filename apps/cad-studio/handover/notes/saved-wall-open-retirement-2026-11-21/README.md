# D1535 — Retire a saved-wall gesture across native Open

P0, row 12, [#629](https://github.com/barocss/cad/issues/629). Base `71faf99b05e70e32f1e7491fce069286890b96eb`. This is a test-only check of the existing source ownership.

- **PASS, actual desktop Studio.** Reopen a +3 mm right drafted wall and physically drag it to a +4 mm preview while keeping the pointer down. Use the toolbar Open with the keyboard and open a distinct +2 mm native file with the same body, feature and face IDs. The earlier editor and handle retire. Open the same named feature in the new document before releasing the old pointer. Moving and releasing that pointer preserves the new +2 mm preview, accepted document, clean state, selection and history controls.
- **PASS, following edit and native file.** Enter +3 mm in the new editor and Apply. Undo returns to +2 mm in the new file. Redo, Save and fresh Open recover the accepted +3 mm native digest. The independent oracle agrees with Studio and native volumes at 11380.612619285575 and 11667.335891990815 mm³. It confirms eight corners, six support planes and the original topology IDs. The −0 and original named reference conventions remain those of the existing Offset.
- **PASS, affected checks.** 93 focused Studio tests, browser syntax and Git diff. The actual browser run has zero runtime errors, console errors and frozen-source changes.
- **FAIL, corrected harness assumptions.** The first driver expected a discard prompt, but starting native Open retires a source-owned History gesture when its open intent changes. A second driver compared JSON property order after Apply. The accepted document had the expected data. The final driver observes the actual Open path and compares semantic document equality after the following edit.
- **NOT_RUN.** Local product build and types for this test-only change, full local suites, other Open sources, malformed input and mobile. #629 remains open.

Use Node 22.19.0 and installed Chrome and Playwright. Gate heavy work and keep evidence outside Git.

```sh
pnpm --dir apps/cad-studio test history-fillet-radius-receipt scalar-handle-drag open-ownership history-feature-editor
node --check apps/cad-studio/test/offset-drafted-wall-browser.mjs
git diff --check
cd apps/cad-studio
D1261_SOURCE_FROZEN=1 node test/offset-drafted-wall-browser.mjs "$EVIDENCE/held-open" --replace-held
```
