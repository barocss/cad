# D2049: Keep a late Separate pieces from cancelling a newer File Open

P1, [#5](https://github.com/barocss/cad/issues/5). Prior public base: `8c38af172d9694e531408c2657f1af49ec8be15d`. Separate pieces evaluated a document before committing. If a later native file's read was pending, the earlier successful result could append Separate to the old file, mark it dirty, and silently revoke the new Open. D2047 and D2048 fixed distinct reorder and delete paths, not this path.

Use the same captured owner as existing History reorder, suppression and delete. A no-longer-current Separate result cannot commit or show an obsolete error. No change in Separate geometry, number of pieces, file format, or behavior when the action is still current.

## Verification

- Real desktop Chrome/WebGPU, disconnected two-piece linear pattern from a 10 × 6 mm rectangular extrusion with 30 mm X spacing. The harness changes only the delivery order of the successful real Worker result and unmodified selected-file bytes. Prior reproduces the old 8 mm model split into two instead of the chosen 12 mm source. Fixed opens the chosen unseparated pattern without a stale notice.
- First Undo restores the original one-body two-piece 8 mm pattern (960 mm³) without Separate. Redo and actual Save/fresh Open retain the 12 mm two-piece pattern (1440 mm³). Ordinary Separate on the 8 mm pattern still produces two strictly valid 480 mm³ bodies at [5,3,4] and [35,3,4], exact to the stated tolerance, and Undo restores the pattern. Native verification compares every corner with independently constructed box vertices.
- Original D808 reorder, dependent Hole refusal, Undo/Redo, browser project reopen and subsequent edit passed in real desktop Studio; 13 focused Model tests and the Studio type check with CI-pinned TypeScript 5.9.2 passed. Broader #5 acceptance is not implied.

[Before: old Separate replaced Open](studio/before.png) · [After: chosen file opens](studio/after.png)

```sh
export D2049_SOURCE_FROZEN=1 D808_SOURCE_FROZEN=1 PW_DIR=/path/to/playwright CHROME=/path/to/chrome
node apps/cad-studio/test/separate-file-open-browser.mjs /tmp/separate-open-fixed
node apps/cad-studio/test/feature-order-project-browser.mjs /tmp/ordinary-history-control
# Run against the prior SHA with the same driver in place:
node apps/cad-studio/test/separate-file-open-browser.mjs /tmp/separate-open-prior --prior
pnpm -C packages/barocss-cad-model test transactions o10-rebuild chat-outputs
```
