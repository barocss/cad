# #202: opt-in drawing issue targets

Verification date: **2026-11-18 UTC**. The directory's 2026-11-19 suffix is the local reporting label, not a different UTC execution date.
Base commit: `6479c86e24a6fd99888de794c2ebf220b29a8b15`.
Actual browser evidence was captured before integration, on the base commit above. Main `6ef910eac` was subsequently fast-forward integrated with the product/test/actual fixture hashes unchanged, as checked by the coordinator. Post-integration focused regression and exact pushed-SHA CI are **PENDING**.

This is pre-push evidence for a limited existing-issue implementation unit. Exact pushed-SHA CI and any integration checks must be recorded separately in #202. The broader issue remains OPEN.

## Contract and actual path

The public grouped call `drawing` with `action: "issues"` preserves its ordinary response. Explicit `include_targets: false` is byte-equal to omission. Opting in with `true` adds only `dimension_ids` and `view` to existing issue rows when supplied by the engine. Removing those added fields reproduces the default object. Existing 1-based sheet numbers are preserved. Direct `drawing_issues` dispatcher calls agree with the facade. Null, string `"true"`, and numeric `0` are refused without modifying the document.

The synthetic fixture opens native rectangle-part documents through Studio's public file input, opens Drawing, and focuses the lost issue then presses Enter. This selects the exact retained dimension without triggering its nested Remove button. The inspector queries a copy of the actual Studio-accepted document; it does not inject document state or claim an external MCP call.

Single-sheet retained dimension and two-sheet `lostA`/front, `lostB`/right profiles passed. Changing the active UI sheet does not filter the whole-document public response. A synthetic free-note sentinel appears in neither default nor opt-in payload. Original document, dirty marker, visible History rows, and Undo/Redo availability remain unchanged across selection/query. Each profile separately performs native Save and fresh-context Open, then rechecks the query. Exactly two native downloads occurred. No Fix, Accept, or reference repair is performed.

## Baseline and failure history

- Baseline01 driver PASS: UI could select the retained lost dimension; the engine reported its ID and view, while the public issue contained only code, severity, message, and fix. Native Save/fresh Open retained it. This PASS means the pre-change omission was observed, not that the feature existed.
- The surrounding baseline shell wrapper exited 1 after the driver completed because `status` is reserved in zsh. Keep this wrapper failure separate from the completed browser receipt and cleanup.
- Initial related tests passed 24/24. Subsequent Model type checking failed with TS2339 in the newly added test's `sheet` property access. This was a test type-narrowing problem, not an existing baseline failure or a browser product failure.
- After the guard correction, focused tests passed 5/5. Model type02, Studio type02, and scoped lint02 passed; their logs are empty and process exits were verified by the coordinator. The whole suite was not rerun.
- Actual01 passed both profiles and their reopen checks. Receipt: zero page errors, zero console errors, zero source changes; four contexts, browser, and server closed. All five evidence visibility observations reported issue and selected row visible.

## Evidence and limits

`multi-02-second-sheet.png` is an unmodified synthetic screenshot copied from actual01. It shows the actual second-sheet issue and selected dimension. The coordinator visually reviewed the original. `summary.json` is a selective sanitized receipt summary, not a raw receipt or complete source manifest.

This proves the local public runtime contract and demonstrated UI target identity only. External MCP transport, automatic Fix, independent geometric accuracy, and full-suite validation are **NOT_RUN**. Duplicate-ID behavior is unit coverage, not UI coverage; empty `dims` array preservation is source review only. Hidden/internal history, other scope types, delayed callbacks, and arbitrary drawings are not certified. Existing HOLD, schema, issued identity, and original references are not changed.

Only synthetic evidence is included. Host paths, raw stacks, authentication data, local server URLs, raw receipts, and full source maps are excluded. This folder is targeted validation evidence, not a doc-sync operation.
