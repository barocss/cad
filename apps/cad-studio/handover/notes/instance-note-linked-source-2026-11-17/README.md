# Linked-source design-brief notes: bounded acceptance

Parent: `89e90635bafccc1124a1db533fbec0e5db472627`. Test/evidence only; no product change and no repeated production build. This does not close all of #274.

## Actual result

First browser run `/tmp/cad-note-linked-source-after-01`: **PASS**. The synthetic assembly has shared occurrences p1/p2 and independent p3. The initial accepted document was used to create a synthetic approved baseline through the existing baseline API. This is test setup, not a real user's approval or manufacturing certification.

- OPFS setup writes source A and the assembly. The public browser-project Open loads the assembly and verifies the baseline matches current pinned inputs.
- A second OPFS fixture write changes only source-file notes A → B. This is not a claim about a source-note authoring UI. No revision-offer state is injected.
- Public **Check placed parts** offers B while both accepted occurrences and BOM notes retain A. **Keep Rev A** dismisses the offer without changing accepted inputs; checking again offers B again.
- Public **Accept Rev B** updates p1/p2 to B; p3, geometry sources, placements, other brief fields and the entire saved baseline object remain exact. The baseline remains intact but reports changed p1/p2 inputs. Undo restores pending A/current status; Redo restores accepted B/changed status.
- Initial, pending, kept, accepted, Undo/Redo and reopened inspections assert the linked-part editing refusal and zero **Edit notes** buttons. No eligibility expansion is made.
- Four independent Python CSV/JSON checks verify quantity 3, occurrence mapping, complete note fields, unchanged baseline and source/placement data. The default purchase CSV remains byte-identical. Notes CSVs are original Blob text intercepted at their export boundary, not downloaded CSV files.

## Two distinct save boundaries

1. With the OPFS project active, public Save is followed by polling the actual assembly file until its complete text equals the accepted document's pretty JSON, then parsing it and comparing the complete document. `encodeStudioFile` (`packages/barocss-cad-model/src/engine/container.ts:38`) emits this representation when there are no binary references. This observes committed readable bytes, not the application's `writable.close()` promise directly.
2. After public **Close project**, public Save produces a real browser download, saved as [linked-notes-B.bcad](linked-notes-B.bcad). A fresh browser context opens that file through File Open. Accepted document, B note mapping, baseline status and linked-edit refusal persist. This fresh context does not reconnect the OPFS project or recheck its external source.

Downloaded file: **5810 bytes**, SHA256 `d09eeb3cf80b17696485d854e60fdf5ebc0b5a118e15b1511a9dfebacfab90c7`.

## Screenshots and evidence

- [Pending revision](02-B-waiting-A-retained.png): accepted Rev A, shared by two, with explicit Accept B / Keep A controls.
- [Accepted revision](05-accepted-B.png): Rev B, shared by two. A previous notification toast remains visible; it is not used as revision authority.
- [Fresh-open BOM](08-reopened-BOM-B.png): qty 3, p1/p2 note B and p3 note A with provenance and non-approval wording.

Actual screenshots were inspected; the pending and fresh-open images were independently inspected as well. Synthetic fixture only, no personal information. Baseline/refusal text below the viewport is checked through public DOM assertions, not claimed readable in these screenshots. Independent downloaded-JSON review also confirmed baseline/p3 equality and the retained `./source.bcad` link.

[Curated receipt](receipt.json), [raw-log hashes and sanitized logs](logs.txt), [independent parser](instance-note-linked-source-oracle.py), initial document and all four oracle input/result files accompany this note. The runner's raw receipt remains at the run directory; its SHA is retained in the curated receipt.

## Verification and reproduction

Focused linked-contract tests: **3/3 PASS**, Studio typecheck and targeted test lint PASS. The first focused attempt had a missing-parenthesis bundle error and ran no tests; the corrected second attempt passed. Browser driver syntax and lint PASS. Actual browser first run PASS, no browser retries or product fixes. Full frozen source capsule **1265 files**, unchanged after cleanup; initial subset was only 4 files. Errors, console errors and source changes are empty. Two contexts, browser and server closed; heavy gate and source freeze released.

From `apps/cad-studio`, using Node 22:

```sh
node scripts/test.mjs instance-notes-linked-revision
pnpm exec tsc --noEmit
pnpm exec eslint test/instance-notes-linked-revision.test.ts
node --check test/instance-note-linked-source-browser.mjs
pnpm exec eslint test/instance-note-linked-source-browser.mjs
# Acquire the shared heavy gate and freeze all source writers first.
NOTE_LINKED_SOURCE_FROZEN=1 \
PW_DIR="$HOME/.cache/barocss-playwright" \
CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
node test/instance-note-linked-source-browser.mjs /tmp/cad-note-linked-source-after-01
```

`createFlow` records initial files plus the actual bundle dependency capsule, verifies source hashes after cleanup, and preserves original screenshots/documents/oracle results. Exact executed logs are listed in `logs.txt`; no repeat geometry accuracy suite was required for this test-only change.

## Limits

No native-folder picker, network linked source, concurrent source race, malformed/duplicate source actual flow, arbitrary assembly constraints, cited-analysis freshness, signer authentication or manufacturing approval was qualified. Geometry/placement JSON equality is not a new numerical geometry certification. Synthetic approved-record API calls belong only to fixture creation. General note-authoring, revision-policy expansion and other #274 requirements remain separate.
