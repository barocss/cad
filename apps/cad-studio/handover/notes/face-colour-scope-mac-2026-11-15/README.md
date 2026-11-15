# D1355 — Selected-face count and colour target

Completes barocss/cad#83, based on main `7a0b179801a78ce7a55956abd1166592daea4f02`.

## Change and retained scope

`src/ui/SelectionInspector.tsx` reports the selected face count and identifies the body key/name and exact first face used for properties and face colour. The first-face-only explanation is associated with colour controls through aria-describedby. Existing first-face editing, body colour, geometry and selection semantics are unchanged; this is not a multi-face painting feature.

## Verification

- Focused face-selection tests: 13/13; Studio tsc, focused lint, diff check and production build PASS.
- Actual Mac Chrome at 1024 and 1440: top-first, front-first and cross-body two-face selections; only the declared first face receives red. Selected faces, nodes and volumes remain unchanged. Colour removal, Undo/Redo, and cross-body Save/fresh Open pass.
- Root visually inspected 1024 front-first and 1440 cross-body screenshots: readable two-face title and wrapped explicit first-face target, separate body colour controls.
- Final receipt `d1355-fourth/receipt.json` SHA256 `aad04b0bc68722111ead657dcfa4adc84f5973d95bd0a18e8da093acb64b4a35`. Product source frozen during browser verification.
- Earlier driver failures are retained: first fixture used a noncanonical output key; second clicked a face-centre gizmo rather than the face; third incorrectly required colour removal to delete native face-signature metadata. Only fixture/picking/assertion corrections were made. The passing run checks no face colours and unchanged geometry, without discarding retained signatures.

No full-suite, CI, screen-reader, arbitrary topology or batch-colour qualification is claimed. Existing HOLDs unchanged. Next: D1356/#132, Sketch draft Undo after switching to Select.
