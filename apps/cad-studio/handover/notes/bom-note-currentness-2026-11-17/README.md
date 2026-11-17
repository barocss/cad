# #274 · BOM note currentness across a delayed read and document Open

**Bounded actual PASS, test/evidence only.** Parent: `7fae390bdf58e9cb284246353481ff67fc158bbe`. No product changes, schema changes, approval actions or geometry algorithm changes. This is not completion of every #274 acceptance condition.

## Actual scope

One Chrome session used synthetic three-box assemblies A and B with the **same filename `same-notes.bcad`, occurrence IDs `p1/p2/p3`, definition IDs, geometry and placements**. Only existing design-brief note Fields differ. Shared p1/p2 and independent p3 have separate full Fields, including multiline/quoted values, basis, source and reason. No personal or authenticated data was used.

1. Open A, show its BOM, explicitly include notes, then close the panel. Reopen it and hold the actual next **root assembly** `part/read` response (request 11, revision 11, native source epoch 1 / `part:read`). The successful original response is preserved in [held-A-original.json](held-A-original.json).
2. Public Open B under the same filename. Wait for exact accepted B Doc, not evaluation readiness, while the response is held. The BOM shows pending, has no note section/export action and disables purchase export. No notes CSV was emitted.
3. Release the original response and all subsequent callbacks on that same Worker in FIFO order, without changing payloads. All 10 observed callback/tick/boundary samples retained exact B Doc, contained no A note text, and recorded zero CSV exports. This is sampled callback/tick observation, not a guarantee about every browser render or arbitrary scheduling.
4. B's fresh result starts with notes opted out. Explicitly opt in and export. Independent Python `csv` + `json` parses every row and exact occurrence/Field mapping. The sole BOM row is quantity 3, groups p1/p2 and p3; all A values/sources/reasons are absent.
5. Public Open a B-derived document with p3 extrude height 0. The real Worker returns **PARAMETER / n1 / `height must not be zero`** (request 30). The BOM refuses instead of exporting prior notes; accepted invalid Doc remains exact and the CSV count does not increase. This does not assert that the native kernel ran for the rejected input.
6. Public Open valid B again, require a new opt-in, and export identical current note bytes. Both independent CSV parses pass. Final Doc equals B.

The two CSVs are **original Blob/anchor bytes captured before browser download**, written by the harness for independent reading. They are not actual browser-downloaded files. Both are 530 bytes, SHA-256 `e2b9912273b81dec24e9af170e3bdfe7ebad6eab24f092f4ffd2a962d7b1377b`:

- [Current B CSV](03-current-B-notes.csv), [oracle result](03-current-B-notes-oracle.json)
- [Recovered B CSV](05-recovered-B-notes.csv), [oracle result](05-recovered-B-notes-oracle.json)

## Source authority and instrumentation

The evaluation wire intentionally removes `brief`. **Worker geometry is not note provenance.** The driver observes outgoing real `added/ids` records, reconstructs nodes in a per-Worker table, and independently checks the held root's evaluation shape: empty base nodes/outputs plus three literal 10 × 5 × 2 child parts. B's root read is checked against the same evaluation shape. Actual request ID, revision and nativeSource remain unchanged.

`acceptedDocAtPost` is a separately captured read-only document snapshot, not a fabricated request field and not sent to the Worker. Exact accepted A/B Docs, public note UI and parsed CSV provide the note authority. The only intervention in the product evaluation path is callback delivery timing. No success/error/mass payload, instance revision, document or note state is injected.

[Curated trace](trace.json) separates wire/evaluation data from accepted notes, records requests/replies and delivery samples, and preserves the original trace SHA. [Fixture A](fixture-A.json) and [fixture B](fixture-B.json) retain exact authored input. [Receipt](receipt.json) records raw receipt/capsule hashes, original failure classifications and cleanup.

## Actual screenshots

All three actual screenshots were visually reviewed. Synthetic content only; no personal information.

- [02: B accepted, BOM pending, no notes/export](02-B-pending-no-notes.png)
- [03: B notes after explicit opt-in, p1/p2 and p3 mapping](03-current-B-notes.png)
- [04: real height-zero BOM refusal, no stale note export](04-failed-child-no-notes.png)

The viewport geometry in these screenshots is context only, not a new mass, tessellation or topology accuracy qualification. The failing child screen may retain previously displayed geometry while the BOM correctly refuses.

## Attempts and checks

| Attempt/check | Result | Qualification |
|---|---|---|
| actual01 | FAIL | Driver searched for `brief.notes` in evaluation wire, which intentionally strips it. Hold never occurred; B boundary was not reached. |
| actual02 | FAIL | Real root response was held, but the harness compared root `nodes=[]` against child nodes. B boundary was not reached. |
| actual03 | PASS | Correct root expectation; delayed Open/notes CSV, actual failed child and recovery completed. |
| Final `node --check` / scoped eslint | PASS | New driver only. |
| Typecheck/build/native suite | NOT_RUN | Product unchanged; deliberately not repeated. |

Original attempts remain under `/tmp/cad-bom-note-currentness-after-01`, `-02`, `-03`. [Logs](logs.txt) retain original log SHA-256; [receipt](receipt.json) retains original receipt SHA-256 and exact failure text. Neither earlier failure was relabeled a product failure or a PASS. The second failure's actual wire trace identified the root/child distinction used in the final correction.

Final actual03: 536 capsule files unchanged through cleanup; initial explicit subset 8 is not the full capsule. `changes`, page errors and console errors are empty. One context, Chrome and Vite server closed; heavy lane released and source freeze ended before notes were written. No source/driver edits after final actual.

## Original acceptance and remaining limits

This adds note-specific evidence for original #274 verification 5 / minimum contract 7: a delayed read must not expose old notes after document replacement, and failed current evaluation must not leave a stale export. Existing implementation was sufficient; no product fix was needed.

Earlier evidence is reused as history, not newly rerun:

- [D575 purchase-list currentness](../bom-currentness-2026-11-10/README.md)
- [D581 evaluation completeness](../bom-evaluation-completeness-2026-11-10/README.md)
- [D707 nested currentness](../bom-nested-currentness-2026-11-11/README.md)
- [Note Clear](../instance-note-clear-2026-11-17/README.md), [baseline status](../instance-note-baseline-2026-11-17/README.md), [linked source](../instance-note-linked-source-2026-11-17/README.md)

Not tested here: an already-open A consent/export closure surviving Open (A's panel was deliberately closed before the held read), manually invoking captured stale export callbacks, every rapid-change/late-failure interleaving, worker restart, project switch, schema 3/4 no-note compatibility, or execution with a fixed older reader. The zero-export samples prove absence of stale UI/automatic output, not execution of a hidden old callback. No Save/fresh Open or default purchase CSV regression suite was repeated. #274 remains subject to the separate original acceptance audit; manufacturing/Physics/native-folder HOLD and protected WIP are unchanged.

## Reproduction

From `apps/cad-studio`, with Node 22 available:

```sh
export PATH="$HOME/Library/pnpm/nodejs/22.19.0/bin:$PATH"
node --check test/bom-note-currentness-browser.mjs
../../node_modules/.bin/eslint test/bom-note-currentness-browser.mjs
G="$HOME/.claude/local-mods/barocss-lanes-guard/bin/gate.sh"
"$G" acquire heavy 120 cad-bom-note-currentness || exit $?
trap '"$G" release heavy cad-bom-note-currentness' EXIT
PW_DIR="$HOME/.cache/barocss-playwright" \
CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
BOM_NOTE_CURRENTNESS_FROZEN=1 \
node test/bom-note-currentness-browser.mjs /tmp/cad-bom-note-currentness-after-03
```

Use a new output directory for any future run; do not overwrite these attempts. `createFlow` records the explicit subset, full runtime source capsule and after/after-cleanup hashes. Coordinate all writers before setting the frozen flag. The driver has no inspector/native oracle; the independent parser imports only Python standard libraries.

From this note directory, the saved CSV evidence can be parsed without launching the product:

```sh
python3 -I independent-csv-parser.py < 03-current-B-notes-oracle-input.json
python3 -I independent-csv-parser.py < 05-recovered-B-notes-oracle-input.json
```

Owned changes: `test/bom-note-currentness-browser.mjs` and this note directory only. No product files, existing tests, WIP files or roadmap numbering changed.
