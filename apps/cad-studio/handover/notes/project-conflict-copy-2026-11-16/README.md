# Project Save conflict guidance (#622)

An existing project document retains its project path even when File name changes. The conflict notice now directs the user to the existing safe copy route: Project & versions → Close → change File name → Save (download). It explicitly says renaming alone does not change the project path and asks the user to verify the downloaded copy before reopening the original. The original optimistic conflict check and save semantics are unchanged.

Actual Studio Chrome verification (1440×1000, synthetic OPFS project):
- External file updated to height 15; current editor height 17: Save refuses and shows the corrected guidance.
- File name alone changed: original conflict still refuses; external file bytes unchanged.
- Close project: current height-17 document and dirty status remain, allowing the user to stop before Save.
- Injected download preparation failure: error reported; document and dirty state retained; original file bytes unchanged.
- Retry Save: `Recovered-copy.bcad` downloaded and decoded full document equals current editor; external file remains byte-for-byte unchanged.
- Reopen original, edit height 18, normal Save: PASS and decoded stored document matches.
- Final browser receipt PASS with no runtime/console errors or source changes. First harness run failed on an overly strict file-name accessible-name selector; corrected using the observed `.doc-tab input` DOM. No product change was needed for that failure.
- Save ownership/autosave feedback unit tests: 23/23 PASS. Changed source/driver lint: PASS. Studio TypeScript and production build: PASS (existing import/directive warnings).

Driver: `apps/cad-studio/test/project-conflict-copy-browser.mjs`. Use `CONFLICT_COPY_FROZEN=1`, configured `PW_DIR` and `CHROME`, and an artifact output directory.

Limits: this closes the inaccurate guidance path, not native-folder or simultaneous-write qualification. The existing browser-download route has no in-app picker/cancel operation; aborting before Save preserves edits, and preparation failure was verified. Cancellation after handing a download to the browser is not observable by this application and was not certified. This is why the notice requires checking the downloaded copy. Full workspace tests were not run. #620 recovery lifecycle and #621 concurrent-write scope remain separate.
