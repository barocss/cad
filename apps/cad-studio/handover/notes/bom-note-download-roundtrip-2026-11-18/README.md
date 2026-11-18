# #274 BOM notes: actual download and native roundtrip

2026-11-18 actual run: **PASS**. Test/evidence only; no product change in this increment. CI and commit/push have not been run for this evidence package.

## Verified boundary

A synthetic schema 3 assembly contains three ordinary made-part occurrences grouped into one BOM row (quantity 3). The complete note Field for p1/p2 differs from p3 and includes `value`, `basis`, `source`, `why`, `confirmed`, and `said`. Commas, quotes and a real newline are preserved. Confirmation metadata is synthetic input, not an actual user approval.

Six files were obtained through real browser download events and `saveAs`, without Blob/anchor interception: purchase CSV before opt-in, notes CSV A, purchase CSV after opt-in, native Save, notes CSV B after fresh Open and renewed opt-in, and purchase CSV after reopening. Download hashes and sizes are in [verification.json](verification.json); raw downloads are not included here.

The independent Python standard-library CSV/JSON reader passed for both notes files: one data row, quantity 3, exact p1/p2 and p3 mapping, and full Field equality. Notes A/B are byte-identical (752 bytes); all three purchase CSV files are byte-identical (81 bytes), with made parts explicitly enabled. The actual native Save (4233 bytes) was opened in a fresh browser context and matched the original accepted document. Consent was absent until explicitly enabled again.

Document, history and dirty state were checked for UI/export operations within each session. Fresh Open is a separate session, not a cross-session history-equality claim. Renderer identity hits at three known face interiors and screenshots confirm scene continuity; this is not independent geometry/volume validation.

## Screenshots

- [04: opted-in source preserved](04-opted-in-source-preserved.png)
- [07: fresh Open requires consent](07-fresh-consent-absent.png)
- [10: renewed consent and completed roundtrip](10-roundtrip-complete.png)

These are unmodified original PNGs. Visual review found only synthetic CAD content and no visible personal information, credentials or private filesystem paths. The full receipt, HTML, absolute artifact paths and source capsules are deliberately excluded.

## Limits and cleanup

The actual browser/download run does not cover schema 4 or absent-note documents, other assembly categories, delayed callbacks or source-revision concurrency. A separate pinned-reader matrix below covers the stated schema 3/4 persistence cases, not browser/BOM geometry behavior. Existing #274 currentness evidence is not repeated. Fresh Open is semantic document-preservation evidence, not independent codec or saved-file provenance certification.

The receipt reports zero source changes, no page/console errors, both browser contexts closed, browser closed and server closed. No CI, commit or push was performed by this evidence-preparation task.

## Separate pinned-reader matrix: 6/6 PASS

The final `reader05` run compares current commit `8d0fc676a6a8a9566da99174f0c34cdf64e750ab` with pre-feature reader `0bf3aa254ae2857d2affc42da15295ba1af501ed`. Driver SHA-256: `611407a59024fafadc2c38419af03fd8c5b666af48d2bef86b70d4627f7228a7`.

Each schema has absent Brief, absent notes with an unrelated purpose retained, and valid notes cases. Schema 3 uses ordinary root/shared/independent part documents. Schema 4 uses a **valid root-only route bundle generated through existing APIs**, not schema-tagged boxes or nested schema4 instances. Current encode → old read → old re-save → current read preserves the complete document, and old/current `readBrief` preserve the relevant Field semantics. This is **not old BOM notes UI/export compatibility**: that consumer did not exist. The matrix uses separate synthetic files, not the six browser-downloaded artifacts above. Shared references are compared structurally, not by memory identity. Route/BOM geometry evaluation remains NOT_RUN.

Both bundles use source-only archives from their own exact commits. The old build verifies 520 product source inputs, the current build 526, plus 20 explicit type-only imported targets each. Each input/target is checked against its commit's Git blob and realpath. AST validation admits only explicit erased type imports; emitted runtime non-builtin externals remain forbidden. Both output import lists are empty. Archive, bundle, metafile and driver hashes are recorded in verification.json. The host TypeScript parser is 5.9.3; this is tooling, not mixed product source.

Earlier attempts are distinct from the final PASS:

- reader01: guard assert argument typo; compatibility cases NOT_RUN.
- reader02/03: harness refused explicit type-only metadata as external runtime imports; 0 cases passed.
- reader04: schema3 3/3 PASS; invalid schema4 fixture halted before a valid schema4 positive. No schema4 compatibility claim from that attempt.
- reader05: valid corrected fixtures, 6/6 PASS.

Related regression logs report Model 15/15 and Studio 13/13, zero failures. Their hashes are recorded separately. CI and commit/push remain NOT_RUN at this preparation step. Raw receipts, archives, bundles, metafiles and absolute paths are not included in this public evidence folder.
