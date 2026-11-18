# #202: opt-in geometric diameter discovery

This is limited pre-push evidence for an existing OPEN issue, not completion of #202. Local validation-log date: **2026-11-19**, not a UTC execution-date claim. Tested baseline HEAD: `f5b572e3`; no integrated SHA is claimed here. Integration checks and exact pushed-SHA CI are pending and must be recorded separately.

## Supported contract

The local public `drawing` action `dimensions` preserves the existing linear-only default. Explicit `include_diameters: false` is byte-equal to omission. With `true`, linear rows gain only `kind: "linear"`; removing it recovers the default rows. Diameter rows expose only ID, view, kind, resolved status and raw model-millimetre value, or an unresolved reason. They do not expose printed diameter annotations, H7 limits, authored diameter tolerances, or manufacturing meaning. Existing response provenance is unchanged. Tolerance stacks remain linear-only.

The synthetic native document contains one linear dimension, one manual diameter with an authored H7 annotation, one retained unresolved diameter, and a synthetic free note. Public native Open, Drawing display, local facade/direct-dispatcher comparisons, native Save and fresh-context Open passed in actual02. The queried input is a copy of the Studio-accepted document, not hidden state injection. Default/false equality, strict malformed inputs (eight facade/dispatcher refusals), exact minimal diameter keys, unchanged linear rows, and diameter stack refusal passed. The document, dirty marker, visible History and Undo/Redo availability were preserved across reads. One native download was read back and reopened.

## Baseline and failure history

- Baseline01 PASS observed the documented linear-only contract alongside the three native/UI dimensions. This is a missing opt-in capability baseline, not a claim that the previous contract was defective.
- Check01: 27/31 tests passed; three floating-point fixture expectations and the schema budget (25098) failed. Fail-fast stopped this run: Model typing, Studio typing, lint and actual browser checks were NOT_RUN.
- Check02: 31/31 tests passed; Model typing failed with three errors. Check03: 31/31 passed; one downstream type error remained. Both runs stopped at Model typing: Studio typing, lint and actual browser checks were NOT_RUN in check02 and check03.
- Check04: 51/51 tests, Model and Studio typing, and scoped lint passed; schema budget was 24981. These staged results were supplied and verified by the coordinator, not rerun while preparing this evidence.
- Actual01: the initial public inspector checks passed, then the fixture counted the free-note row sharing `.dw-dim`, producing 4 instead of 3. Save/fresh Open was NOT_RUN. The fixture was narrowed to rows containing a `Remove dimension ` button, retaining the note and all assertions; no product change was needed for this failure.
- Actual02 PASS: all receipt observations passed; zero page errors, console errors and source changes. Two contexts, browser and server closed. The coordinator directly reviewed the reopened screenshot.

## Evidence and limits

`initial.png` and `reopened.png` are unmodified synthetic screenshots. `synthetic-dimension-kinds.bcad` is the actual native download. `inspector-proof.json` selectively retains initial and reopened expected values and public payloads; `summary.json` contains sanitized stage statuses. `SHA256SUMS` identifies these evidence files.

Raw geometric values are not printed/manufacturing results. The observed diameter is 25.400000000000002 mm; no decimal-rounding or H7 certification claim is made. Projection comparisons use product contracts, not an independent geometry oracle. External MCP transport, independent geometry certification, H7 table certification, and full-suite execution are NOT_RUN. Only one synthetic sheet and scope are qualified.

The synthetic free-note sentinel is absent from responses; new diameter rows also omit synthetic source metadata. Existing sheet-name/scope provenance is preserved, not newly sanitized. Privacy-provider coverage is synthetic and does not certify real catalogue integration. There is no automatic Fix, annotation acceptance, issued-identity change, schema migration, or tolerance-stack expansion. Existing HOLD remains in force.

No raw receipts, host paths, local URLs, stacks, authentication data, source capsules, or caches are published here. This is targeted verification evidence, not doc-sync.
