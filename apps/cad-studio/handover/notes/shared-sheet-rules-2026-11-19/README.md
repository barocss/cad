# #27: direct terminal sheet-contour shared rules

## Narrow result

The actual Studio U profile now offers **Edit shared sheet rules** in its Flat pattern dialog. This opens the existing History editor, not a new command, schema or geometry path. The label explicitly says that the profile's bends share thickness, inner radius and K-factor or bend table. A table-backed sheet does not acquire an editable K field.

Ownership requires the actual BodyResult.ref and matching authored/evaluated output entries, an identical source contour node, terminal position and current bodies. No bend-name parsing, sorted IDs or selection-based ownership is used. Downstream producers, suppressed nodes, assemblies, variants, rollback, busy or in-place contexts do not receive the shortcut. The initial dialog stores its body and source snapshot; it cannot retarget to a newer document reusing the same body key. Click and deferred History transition both recheck document/evaluated/Open/worker/work-generation ownership.

## Actual evidence

- Created U through public Create → Sheet profile: outside base 40, legs 30, width 25, T1.5, R2, K0.44; two native bends and strict BRep validity.
- Existing unmodified baseline had no shared-rule shortcut; its History fields were already editable.
- Shortcut opens that same owner; R2 → R3 changes both bend radii, preserves node identity and all other authored data. Undo returns R2; Redo restores R3. Native Save and fresh-context Open retain R3.
- Independent flat-area arithmetic for each state: `25 * (100 - 2 * (2*(R+1.5) - PI/2*(R+0.44*1.5)))`. Product native/flat outputs are retained separately in `native-flat-checks.json`.
- Native file transport was held pending using a test-only File.arrayBuffer wrapper. During that pending Open, R3 remained accepted and no History editor opened; the screenshot shows the old dialog hidden. The driver conditionally attempts a click only if the old button remains visible, so it does **not** claim unconditional stale-click dispatch. Open-token mismatch is separately covered by a unit test.
- Releasing transport opens R2 with the same b0 key; old modal stays absent. Reopening Flat explicitly permits navigation to the new R2 owner.
- 11 unit tests; Studio tsc; model tsc after final test edits; changed-file ESLint; Vite production build; diff check all PASS. Build emits existing-category dynamic-import/module-directive/chunk warnings, not errors.
- Final browser: no console/page errors, no watched source changes, all 1,112 source hashes unchanged through cleanup. Both contexts, browser and server closed. Screenshots were visually reviewed; only synthetic CAD model/UI content is retained here.

## Replay

Use Node 22.19.0, repo-installed dependencies, existing local Chrome/Playwright and the documented exclusive heavy gate. Set `PW_DIR`, `CHROME`, `CAD_STUDIO_CHAT_PORT` and `SHARED_SHEET_RULES_SOURCE_FROZEN=1`, then run:

```sh
node apps/cad-studio/scripts/test.mjs shared-sheet-rules
node apps/cad-studio/test/shared-sheet-rules-browser.mjs "$OUTPUT"
```

## Limits

#27 remains OPEN. No per-bend radius editing, downstream owner inference, manufacturing qualification, export change, bend-table editing or general multi-body/assembly acceptance. The supported U baseline has no active draft at shortcut entry; a queued dirty-draft discard UI transition was not replayed in this run. Deferred callback ownership is rechecked in code and owner invalidation is unit-tested. Manufacturing HOLD is unchanged.
