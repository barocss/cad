# Invalid Variant input retains the accepted preview (#77)

Parent: `ec74439923279db2869aeba79d59743525f4bb6c`.

## Change

- `useVariants` retains the last accepted working value set separately from the invalid draft. A refused draft regenerates that accepted preview instead of silently returning the master. The displayed variant identity and existing model-edit guard therefore remain active.
- Explicit Master, Reset, active-set changes/Undo and accepted document replacement retire the appropriate preview/draft together. The document-switch scope still rejects old setters.
- The Variants panel connects the numeric field to one adjacent range/recovery error (`aria-invalid`/`aria-describedby`), labels the retained display as the last valid preview, and disables Update/Save for invalid drafts. No invalid values are committed; file schema, solver and native model APIs are unchanged.

## Verification

- Actual Chrome WebGPU 1024×900 and 1440×900: high=25 → unsaved valid35 → invalid51 keeps height35 and accepted document unchanged. Independent Python volume/centroid arithmetic verifies displayed geometry. History Width Apply remains refused with the existing show-master notice.
- Field error association, one local alert, disabled Update and named Save, Reset to high, valid Update15, Undo25/Redo15, real Save/fresh Open15, repeated invalid input and explicit Master10/editable History: PASS at both sizes. Screenshots reviewed.
- Existing `variant-document-draft-browser.mjs --expect=fixed`: PASS for panel-open/closed document replacement, invalid/cancelled Open preserving working drafts, no-input intermediate document, variant Save/Update, active switches, and cross-document Undo/Redo. Passive outgoing evaluation observer confirms no old draft on the new document.
- Changed-file ESLint and Studio TypeScript/Vite build: PASS.

## Limits

The new browser regression uses a synthetic parameter-driven box, not the issue's original multi-instance mate fixture. It checks shared Variant preview/guard ownership and independent displayed geometry, not new mate-solver capability. Boolean/choice invalid inputs, assistive devices and the original pin fixture are NOT_RUN. #126 WIP and all HOLD scope remain untouched. No release/deploy.
