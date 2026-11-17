# Varying Fillet: identify the start-radius handle

Parent: `446298a67`. A bounded #118 presentation fix, not new Fillet geometry support.

## Gap and change

The original straight-edge Varying Fillet HUD already said **Start radius**, but dragging its central radius handle displayed **Radius** in the handle box and accessible name. The baseline actual run observed both labels with value 1.5 and End radius 3.

A shared `commandFieldLabel` helper now supplies the same presentation name to HUD and command gizmo. Only exact command `fillet`, type `edge`, mode `varying`, field `radius` becomes **Start radius**. Constant mode retains **Radius**. Keys, values, edge references, preview/evaluation, producer algorithms and persistence are unchanged. Other fields and commands are not renamed.

Product files: `src/app/commandFieldLabel.ts`, `src/ui/Hud.tsx`, `src/viewport/useCommandGizmos.ts`. Focused tests: `test/command-field-label.test.ts`. Actual driver: `test/fillet-start-handle-label-browser.mjs`.

## Actual evidence

Both first executions completed with PASS; baseline PASS means successful reproduction of the pre-fix mismatch, not absence of a defect.

- Before: `/tmp/cad-fillet-start-label-before-01`, source capsule 532 unchanged. Public edge pick → Varying Start1/End3 → real radius-arrow drag produced Start1.5 while the handle remained labeled Radius. Cancel preserved the complete accepted source document.
- After: `/tmp/cad-fillet-start-label-after-01`, source capsule 533 unchanged. HUD and handle agree on Start radius. Direct handle input 2 plus blur updates Start only. Another real drag changes Start while End3, picked references and accepted source remain unchanged.
- Constant mode restores Radius; switching back restores Varying/End3. Cancel leaves the source exact. A new command with handle input Start2/End3 applies, then Undo/Redo restores the exact accepted documents.
- The applied document has parent node1 solid, edge `n1.side0|n1.top`, radius2 at `[0,0,20]` and radius3 at `[30,0,20]`. Original nodes and parameters remain unchanged. This is document/source verification, not an independent native geometry accuracy measurement.

[Before mismatch](before-01-varying-handle-label.png) and [after Start2 / End3](after-03-start-two-before-apply.png) were directly and independently inspected. Synthetic box, no personal information. The after image visibly shows both Start radius labels and End3. [Applied document](applied-document.json), curated before/after receipts and [sanitized logs with original hashes](logs.txt) are retained.

Both runs report zero errors, console errors and source changes. Context, browser and server cleanup completed. Heavy gates and source freeze were released before documentation writes.

## Checks and reproduction

New presentation helper tests **3/3 PASS**; Studio typecheck and scoped lint PASS. Driver syntax/lint PASS. Sequential production build `pnpm run build` PASS (Vite **18.21s**, under elevated host load). No failing actual retry was needed.

From `apps/cad-studio`, Node22:

```sh
node scripts/test.mjs command-field-label
pnpm exec tsc --noEmit
node --check test/fillet-start-handle-label-browser.mjs
pnpm exec eslint test/fillet-start-handle-label-browser.mjs
# Freeze source writers and acquire the shared heavy lane first.
FILLET_START_LABEL_FROZEN=1 \
PW_DIR="$HOME/.cache/barocss-playwright" \
CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
node test/fillet-start-handle-label-browser.mjs /tmp/cad-fillet-start-label-after-01
pnpm run build
```

The pre-fix run used `--baseline` on the parent product source. Do not run that expected-mismatch mode against the fixed product. `createFlow` freezes its dependency capsule and compares hashes through cleanup. Raw log paths and SHA256 values are in `logs.txt`.

## Limits

Actual acceptance covers **Ends controls, one straight front-top edge of a 30×12×20 box, circular section**. Interior station value preservation is not an actual claim. Curved/multiple edges, Face/Full round, other sections and History handles are not newly qualified by this run. Helper tests cover unchanged presentation names for unrelated states/fields, not their native geometry. Save/fresh Open and independent native recomputation were deliberately not repeated for this label-only change. Protected WIP and HOLD scopes are unchanged.
