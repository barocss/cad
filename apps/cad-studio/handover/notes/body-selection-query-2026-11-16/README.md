# Current body property selection — #260

Base: `8f009dda0e714c625c935f837a89300885dedfbf`. Bounded P4 utility, not a roadmap reorder or owner UI redesign. Existing Shell/#126 and Direct/#29 work remains untouched.

## Delivered

Browser's collapsed **Select bodies by properties** disclosure previews current visible base bodies by literal case-insensitive name substring (trimmed; maximum 256 input characters), AND exact material ID. Any and Unspecified are distinct; material lookup uses existing body→stated brief inheritance, not assumed physical density. Same-name bodies remain distinct original indices. No regex, metadata writes, saved filters, schema, kernel or dependency changes.

`app/bodySelectionQuery.ts` owns pure candidate interpretation. `ui/BodySelectionQuery.tsx` owns transient query/review/feedback. App retains selection authority and its existing operation admission: current document, evaluation, bodies, generation, Worker and Open intent. Changed source/context requires Refresh and another explicit Select; no automatic selection rule. Open/New reset via document generation. Empty conditions and zero matches preserve selection. Existing single-domain selection is used, clearing direct/instance and all non-body members.

The existing ordinary-Model gate blocks busy/stale/failed/command/sketch/Measure/section/in-place/Render/Drawing/dialog/drag contexts. Pointer-down on unavailable disclosure cannot blur and commit an outside rename input. Query native text keys do not reach model shortcuts. No preview calculation or Worker requests are introduced.

## Evidence

- Pure helper + static UI: **6/6 PASS**. Covers duplicates, source indices/reordering, hidden/placed/direct/ambiguous/stale-output exclusion, explicit/brief/undefined material, literal bracket names, empty/overlength/zero refusal and no mutation.
- Studio TypeScript `--noEmit`, targeted ESLint, production Vite build: **PASS**. Build retains pre-existing dynamic-import/directive warnings, not a zero-warning claim.
- Actual Chrome desktop WebGPU driver `test/body-selection-query-browser.mjs`: final `/tmp/cad-body-query-03` **PASS**, errors `[]`, source changes `[]`, all contexts/browser/server closed. 1440×900 and 1024×800 screenshots inspected.
- Independent six-box manifest: A/B Plate/steel, C Plate/abs, D Bolt/steel, E hidden Plate/steel, F [Plate]/unspecified. Expected source indices are literal `[0,1]`, `[2]`, `[5]`; same-key second document's stated steel brief adds F to `[0,1,5]`.
- Actual typing, zero match, Clear, literal brackets, explicit and repeated selection; exact Doc/body/eye/dirty/history snapshots unchanged apart from selection. Worker postMessage observation on the original context showed no request from query/selection.
- Actual native text Meta+A/Undo/Escape; pending external rename remains focused and uncommitted after disclosure clicks; active Linear pattern and its inputs remain intact while query selection is blocked.
- Rename and hide invalidate review; explicit Refresh does not select. Same-key Open, New and actual Save→fresh context Open preserve full Doc and reset query.

Runs 01 and 02 also passed. Read review identified outside rename blur risk before first run; pointer-down and disabled controls resolved it. Screenshot review after run 02 found inline labels wrapping together and an old selection message persisting in blocked context; existing field styling and current-context feedback were applied, then full focused/type/lint/browser/build checks were rerun for run 03. No failed product check is omitted.

## Initial delivery limits (superseded by follow-up below)

At the first delivery, #260 remained open pending broader interruption/identity acceptance. Actual Measure/section/assembly/Render/Drawing/failed-evaluation gates, material edit, delete/Undo identity, injected delayed replies and real IME/device text services are **NOT_RUN**. Array reorder is helper-tested, not an actual model-history browser flow. WebGL2, mobile and whole repository suite are NOT_RUN. No assembly/nested/direct search, hidden-body reveal, automatic edits, localStorage, public API, manufacturing or other HOLD expansion.

Commands (shared heavy lane, source frozen during browser):

```sh
node scripts/test.mjs body-selection-query
node ../../node_modules/typescript/bin/tsc --noEmit
node ../../node_modules/eslint/bin/eslint.js src/App.tsx src/app/bodySelectionQuery.ts src/ui/BodySelectionQuery.tsx test/body-selection-query*
BODY_SELECTION_QUERY_FROZEN=1 node test/body-selection-query-browser.mjs /tmp/cad-body-query-03
node ../../node_modules/vite/bin/vite.js build
```

Existing local Playwright and official Chrome were used, with no downloads. CI is checked for the final commit separately in the issue record.

## Follow-up acceptance: interruption and identity

Base product: `c10f1df17b8c57dff1f700ee155d51370ef18404`; no product changes in this follow-up. Two focused real-browser drivers replace the earlier NOT_RUNs rather than rerunning unrelated suites.

- `body-selection-query-interruption-browser.mjs`, `/tmp/cad-query-interruption-01`: **PASS**. Actual UI entry to Measure, Section, Render/Drawing mode transitions, reopened Sketch and inline-instance Edit part; query controls disabled, an actual pointer click on Select cannot cancel/change the mode or its document/entry selection/dirty/history. Normal return requires Refresh (or new session query entry) and explicit selection. In-place Cancel restores the original assembly. No Physics/Motion/manufacturing activation.
- `body-selection-query-identity-browser.mjs`, final `/tmp/cad-query-identity-02`: **PASS**. Actual Inspector steel→abs invalidates query; Refresh selects only the remaining steel body. Delete first body shifts remaining indices; explicit selection targets the correct key through Delete/Undo/Redo. No matching by display row/index from a previous evaluation.
- The identity driver holds an actual successful nudge evaluation reply and all subsequent same-Worker messages. While pending, query remains disabled; after FIFO release, only explicit Refresh/Select works. Another actual held reply is overtaken by New; after FIFO release, the new empty document, empty selection and reset query remain. Payloads are not changed. Same-Worker raw reverse delivery is deliberately not tested because the mesh delta protocol requires posted order, including stale replies; the test proves a newer document intent overtaking a delayed real result, not a broken transport simulation.
- Actual zero-height native failure displays **Sizes must be greater than zero**, leaves stale bodies unselectable, and recovers after valid Open and explicit query selection. Busy/failed tests assert disabled controls plus ineffective DOM `.click()`; the separate mode driver uses actual pointer clicks.
- Synthetic composing Enter/Escape/Delete/Ctrl+A/Ctrl+Z events reach zero window bubble listeners and preserve document/selection/query. This is event-isolation coverage, not an OS IME or language-service certification. Prior actual native Meta+A/Undo/Escape evidence remains.
- Both final receipts: errors `[]`, source changes `[]`, context/browser/server cleanup complete. Pending evaluation, native failure, in-place and Drawing-transition screenshots inspected. Both new drivers pass syntax/targeted lint. The original six focused tests, type/lint/build and successful product CI remain applicable because runtime source is unchanged. Final test/docs commit CI is checked separately.

### Original minimum acceptance disposition

| Contract | Evidence |
| --- | --- |
| Visible top-level, literal name AND exact ID, Any/Unspecified/inheritance | Pure helper 4 tests + original independent six-body browser manifest |
| Input previews only; empty/zero/Clear preserve selection | Original browser and static UI tests |
| Original indices/single-domain selection, duplicate labels | Original browser + actual first-body Delete index shift/Undo/Redo; source uses existing selection setter |
| Changed doc/evaluation/metadata/hidden requires review; Open/New reset | Original rename/hide/same-key Open; material change; held evaluation and overtaking New |
| No live rule after selection | Metadata/deletion changes do not reapply query; explicit Refresh and Select required |
| Unsupported context and keyboard isolation | Actual command/rename plus six mode transitions, pending/failing evaluation, native text shortcuts and synthetic composing events |
| No persistent/model mutation; actual Save/fresh Open | Original exact state/Doc/file and observed Worker-request comparisons; query lives only in component state |
| Small existing control/no new API/dependency | Independent helper/review component, existing field styles and central App authority; no schema/SDK/kernel changes |

No missing in-scope behavior is currently known from this bounded evidence. Real OS IME, WebGL2/mobile/full-suite, transport reordering and crash injection remain unqualified rather than silently called PASS; those are not an expansion of this desktop, current-body selection contract.
