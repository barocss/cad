# History cut-source intent parity (#25, partial)

Base: `871e54f468d8126fb923bff075e645f80b469eec`.

## Reproduced and fixed

Actual Chrome baseline: select the current result body, open and close earlier Subtract n4 through History, then start Rectangular cut pattern. The HUD silently shows `Cut source Subtract 2 (n7)` and a preview. The source document is unchanged on Cancel, but the intended older source has been substituted. The existing Browser route already refused that mismatch.

History now records Subtract source intent inside its approved `switchWhenReady` callback, using the same document-and-selection ownership guard as Browser. It does not change the retained selection or automatically choose another body/source. An explicit body reselection retires the prior intent and retains the supported latest-Subtract path. The shared ref was renamed from `browserSubtract` to `cutSourceIntent` to describe both entry points.

## Verification

- `HISTORY_CUT_SOURCE_FROZEN=1 node test/history-cut-source-browser.mjs <output> --baseline`: reproduces the old wrong-source preview at 1024×800 before product modification. The recorded HUD explicitly names n7 after inspecting n4.
- Same driver without `--baseline`: **PASS**, actual Chrome WebGPU **1024×800 and 1440×900**. For each Linear, Rectangular, Fill and Path cut-pattern command, both Browser and History paths now refuse n4→n7 substitution with the same recovery message. **16 refusal flows** retain document, selection and Undo label; explicit current-body reselection opens the n7 HUD and Cancel retains the original document. Clean state is retained. Narrow Rectangular and wide Path refusal screenshots visually reviewed.
- No runtime/console errors or frozen-source changes.
- Related candidate tests: **5/5 PASS** from the selected runner filters (`cut-pattern-source rectangular-cut fill-pattern-candidate workspace-mode-exit`; only matching tests execute).
- Final Studio TypeScript and production build **PASS** (4.75s). Driver syntax and `git diff --check` **PASS**. App lint still reports the pre-existing `_k` unused variable, now line 2436; full App lint is not claimed clean.
- Independent read-only review found no concrete security or regression blocker.

## Scope

This fixes the reported History/Browser launch mismatch, not arbitrary earlier-Subtract repetition, pattern geometry, Count/spacing handles or new path families. Apply/Undo/Save/Open geometry was not requalified by this launch-and-Cancel change. #25 remains OPEN for its broader outstanding acceptance. #126 WIP, kernel/schema behavior and all HOLDs remain unchanged.
