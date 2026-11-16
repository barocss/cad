# Multiple-outline circle constraint filtering

Issue #21, checklist row3209. Parent09014881f2908891829d6cfaa47a2f8f0d25188f; parent push CI43939817873 completed SUCCESS. Test-only acceptance extension, no product changes.

## Actual frozen Chrome

`/tmp/cad-multi-circle-03` PASS. At900×800, a polygon with two attached circles plus a separate rectangular hole is reopened. Distance/Picked only filters survive explicit active-outline switches without showing another outline's constraints. On the main outline, real circle selection gives2/9; removal1/8; draft Undo2/9; Redo1/8, with the same circle selected. Finish changes only the intended circle constraint: circle geometry, holes, hole recipes, side tags and downstream Extrude remain exact. Document Undo/Redo pass. At1280px, browser-project Save bytes equal the accepted document; fresh-context Open/edit retains the surviving circle constraint, and Cancel leaves the document unchanged. Saved SHA2561c7af51ed336b7d67bf58ad5f5a943ff832573e8dcb6cea685e5cc3b257e3e93. Screenshot reviewed; native/browser console errors and downloads empty, frozen graph unchanged.

Setup failures retained: run01 expected seven constraints on the auxiliary outline, but the actual reopened recipe lists five; run02 tried the overflowed Project button at900px. The final driver expects the existing five-row recipe and widens only for Save. Neither was a product failure. The test does not qualify preservation of input-only auxiliary length locks.

Studio TypeScript and affected lint PASS. Production code is unchanged; prior commit's focused13/13, build and successful CI remain retained evidence, not new executions.

Run under the shared heavy gate from Studio with Node22:
`CIRCLE_PICKED_UNDO_FROZEN=1 PW_DIR=... CHROME=... node test/constraint-list-browser.mjs OUTPUT --multi-circle-picked-undo`.

## Remaining #21 boundary

Existing D1106 `oblique-round-lock-order-2026-11-14` already covers both oblique-plane lock orders, R10 refusal, R5/R20 recovery, native geometry and Save/Open. Do not rerun it as a new gap. Existing `--source-edit` cancels/reopens after refusal; `--free-fillet` and `--lock-order` do not prove repair of a historically collapsed arc in the same draft. Such recovery needs the exact historical state/fixture rather than a fabricated passing substitute. Other DPI/browser and original broad acceptance are not claimed. #21 remains open. Protected WIP/HOLD untouched.
