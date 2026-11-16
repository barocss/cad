# #621: two-tab Studio OPFS conflict and recovery

Product baseline: `8752aabfe5132f22cc41039ed37514fa9266f808`.

The existing scoped OPFS lock and current Studio Save/recovery implementation pass this actual UI follow-up. **No production change was necessary.** This delivery preserves the repeatable browser driver and evidence; it does not close the native-folder portion of #621.

## Actual desktop acceptance

`OPFS_PROJECT_CONFLICT_FROZEN=1 node test/opfs-project-conflict-browser.mjs <output>` with the existing Chrome/Playwright paths: **PASS**, actual desktop Chrome WebGPU, two same-origin tabs in one fresh isolated context, 1440×1000. No user document or authenticated profile is used. Each direction uses a new synthetic OPFS project.

1. Both tabs open a native parameterized bracket at H=10.
2. Winner edits H=11 and loser edits H=14. Each actual autosave completes; independently read recovery file confirms H=14 before any reload.
3. Hold winner's real primary-file writable close, then click Save in loser. Primary stays H=10 during the hold and loser remains dirty.
4. Release winner. Winner becomes clean, primary becomes H=11. Loser shows `part.bcad changed elsewhere`, retains H=14 and dirty state. Repeated loser Save still does not replace primary H=11.
5. Reload loser and explicitly Open: primary H=11 loads with recovery offer. Restore returns H=14 dirty without changing primary. Explicit Save then succeeds against the freshly read primary receipt, clears dirty and writes H=14.
6. Repeat with tab roles reversed: A wins/B conflicts, then B wins/A conflicts. Both complete.

Final receipt: no runtime errors, no console errors, no frozen-source changes. Conflict-preserved and recovered-clean screenshots were visually inspected. Existing storage/project regressions: **154/154 PASS** (`handle-store-concurrency storage.test project-version-ownership project-restore-admission project-branch-admission project-autosave-feedback project-merge-admission project-open-ownership late-save-ownership`). New driver syntax and `git diff --check` pass. Production types/build were not rerun for this test-and-note-only change; the immediately preceding product commit has its own recorded pass.

## Limits and next boundary

This is not advice to reload an arbitrary conflicted document: this fixture first confirms that the exact H=14 recovery copy exists. Uncheckpointed edits, autosave refusal and another later autosave writer can require keeping the original tab open and preserving its document separately. The existing error's downloaded-copy recovery route was not exercised; no download is added here.

Native picked folders/aliases, old or bypassing writers, weak size/mtime tag collisions, different origins/partitions and cross-file atomic transactions remain outside the OPFS guarantee. Earlier storage-level lock/receipt/tab-termination tests are retained, not silently recertified as full UI cases. Native folder HOLD and the original #126 WIP remain untouched. #621 stays OPEN for its remaining native scope; hosted CI success is not claimed.
