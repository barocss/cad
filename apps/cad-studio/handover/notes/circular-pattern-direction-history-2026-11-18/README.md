# #705 — Change a terminal circular pattern's axis direction

Baseline: `2bdf45d78`. This is a bounded History edit, not arbitrary pattern or topology support. Actual creation already offers X/Y/Z; the original History offered Count and Z's axis position/spread but no direction choice. Existing Linear distance-mode conversion D836 was found during candidate review and deliberately not reimplemented.

## Contract

Only three nodes: a plain independent XY rectangle, its positive numeric extrusion (optional numeric From, zero/no draft), and its terminal circular pattern. Exactly four copies and positive 90° step. Z must have explicit 360° spread; X/Y have no spread value. Custom pivot (even an explicit zero vector), parameter dimensions, extra metadata, held/suppressed/made nodes, duplicate IDs, downstream nodes, direct objects and instances are excluded. Existing fields and unsupported cases retain their previous behavior.

History changes only axis and the required Z-only full-turn metadata. Seed, feature ID, parent, count, angle and output ownership remain unchanged. The drag HUD cannot inject this control. UI explains the limitation; obsolete typed spread/pivot drafts are retired after a direction change. Native admission remains authoritative and no schema/kernel support is widened.

## Actual Chrome and numerical evidence

- Original UI creation: box `[10,20,30]` to `[14,26,38]`, Circular pattern Z, Count4, 360°, origin, One body. History has no Axis choice. Existing Count3 edit, Undo/Redo and actual Save/fresh Open PASS.
- Fixed X→Y→Z: exact document change, each Undo/Redo and actual Save/fresh Open PASS. Four disjoint native solids, 32 corners and 768 mm³. Independent rotation arithmetic checks coordinates within 1e-8 mm and volume within 1e-7 mm³, with strict B-rep checks. Model named-face boundary tests use literal seed face extents and integer quarter-turns.
- Semantic face names (24) and edge names (48) are nonempty and unique and survive direction changes, including copy suffixes. **Internal B-rep IDs and face order do change between native representations.** They are not persistent reference contracts. No downstream support is claimed.
- Draft direction Cancel preserves the accepted result. Count3 and nonzero pivot hide direction editing; Count Undo and pivot Cancel restore it. X Count5 disables Apply; Enter preserves the document/native result, and correcting Count4 recovers.
- Existing actual X Count (two desktop sizes), Z axis-position and Z spread regressions PASS. Every completed browser has zero console/page errors, unchanged frozen source and complete context/browser/server cleanup.

## Failures and execution limits

The first fixed run reached correct X geometry but failed a fixture assertion equating internal B-rep IDs to the Z representation. It was not treated as product success. Later stages were NOT_RUN for that attempt. Inspection established the semantic-name contract; nonempty/unique names and independent named boundary geometry were added, rather than relaxing tolerances. A fresh frozen full browser run then passed.

At the requested heavy-slot handoff all four browser runs had completed normally. Model tsc had just started; only this run's confirmed shell/tsc processes were stopped. That type attempt is INTERRUPTED, Studio type/build NOT_RUN at handoff. Final restart subsequently passed Model and Studio types and production build (7.68s). No unrelated process or files were removed. Disk was monitored per stage above a 2 GiB reserve.

Focused Model tests: 30/30 PASS. Scoped ESLint, driver syntax, diff check and independent source review PASS. Final Model/Studio types and build PASS (7.68s). Qualification source base was `2bdf45d78`; disjoint assembly `d47c4985f` was fast-forwarded before integration and focused tests rerun. Final type/build disk start 10.75 GiB, end 8.68 GiB. Full suites, arbitrary seed/axis/pivot/count combinations, downstream consumers and other browsers are NOT_RUN. Existing HOLDs and paused doc-sync remain unchanged.

## Reproduction

Use Node22.19.0 and the existing Playwright/Chrome installation under the shared heavy gate. From `apps/cad-studio`, run `CIRCULAR_PATTERN_DIRECTION_HISTORY_SOURCE_FROZEN=1 PW_DIR=<existing playwright> CHROME=<Chrome> node test/circular-pattern-direction-history-browser.mjs <new-output>`. `--baseline` is for the original product source, not the implemented source.

Model: `pnpm --filter @barocss/cad-model test circular-pattern-direction-history circular-pattern-axis-history circular-pattern-spread-history circular-pattern-count circular-pattern-span`.

Images show the missing field, saved X direction editor and Count refusal. They are UI evidence, not an assertion that every copy is visible at each camera scale. The native fixture and quantities are the geometry evidence.
