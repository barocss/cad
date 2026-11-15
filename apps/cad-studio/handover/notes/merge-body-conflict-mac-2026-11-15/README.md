# D1404 — explicit Merge body values and owned choices

## Scope and implementation

Issue #615 is repaired inside the existing local-project Merge conflict area. Body conflicts already carried complete values; the compact scalar display omitted their names, and answers keyed only by location could survive source-branch changes.

`src/storage/MergeConflictChoices.tsx` now shows each branch's complete name and read-only body-settings details, distinguishing absent/empty names from deleted metadata. The choice still takes the entire settings object, not only its name. React text rendering keeps HTML-like strings inert. `src/storage/VersionsPanel.tsx` binds conflicts and answers to the project store/path, working document, current branch/head and source branch/head. Late obsolete conflicts cannot replace a newer selection. The original successful merge/log/open contract remains unchanged, including a head advance before the action returns.

No merge engine, App, schema, geometry admission or storage writer was changed. Existing scalar conflicts retain their compact values.

## Verification

- Focused value/owner tests and existing branch/merge/version/storage regressions: 72/72 PASS. Target lint, Studio TypeScript, driver syntax and diff check PASS.
- Production Vite build PASS on the frozen combined tree including the independent D1405 one-line field visibility candidate. An initial command used the wrong local Vite path and did not run; the corrected root-dependency path passed. No full-suite/CI claim.
- Actual Chrome at 1024×900 and 1440×900: public UI authors Base/Alpha/Beta/Gamma versions and branches. Alpha/Beta choices show both values. Switching to Gamma clears the old answer and requires an explicit new choice. Keyboard radio selection, read-only detail opening and before-apply steps preserve exact document, dirty/history state and primary/version/snapshot bytes.
- Actual apply chooses the whole intended body object, preserves sibling metadata, adds one two-parent version, and does not overwrite the primary file until explicit Save. Undo/Redo and same-context Close/reload/project Open preserve the expected result and files.
- Both widths also exercise isolated valid stored fixtures: same name with different hidden/color settings; long HTML-like names; empty versus unset names; deleted metadata; independent bodies' automatic merge. These five groups are stored fixtures, not a claim that every branch was authored through UI. Exact JSON/byte comparisons independently check the selected objects and saved data. Autosave bytes are excluded from the primary/version/snapshot immutability comparison.
- Existing unchanged D765 actual branch/scalar-conflict regression PASS with its native/analytic volume oracle.
- Both receipts report no page/console errors or watched source changes; all contexts/browser/server closed. Direct image review verified the 1024 Alpha/Beta choices, wrapped inert long names and 1440 deleted-metadata choice.

Receipts: `d1404-first` SHA256 `40dfa04bf08027203b8747b1062583f160642d58a8655a486c514bc5d18bb731`; `d1404-branch` SHA256 `41c85b181bcec02b34d99352bae33a6e43dd2b0424cf4e9f16060004289609fb`.

## Limits

Synthetic desktop projects only. Same-context reload/Open is not browser-restart persistence. Assistive technology, mobile, simultaneous external edits and arbitrary large metadata NOT_RUN. Head/store/path and late-response cases beyond the sequential UI target change are controlled unit tests, not new OS race qualification. Existing HOLDs remain; #608, #613's four overlaps, six baseline drawing failures and API drift are not resolved here.
