# D1324 — Cage selection mode follows actual selection (#554)

## Bounded implementation

Model `subd/cageEdit.ts` infers the active mode from nonempty selection after a pick, operation, Undo or Redo. Empty selection retains the current mode. History entry shape, geometry and native operations remain unchanged. Fill selects the new face in Face mode; a boundary double-click from Face mode switches to Edge. Studio `useCageEditor` preserves selection when the already-active mode button or numeric shortcut is used again; changing to another mode still clears it.

## Independent Mac verification

- Node22.19.0: four new `cage-selection-mode.test.ts` plus19 related tests =23/23 PASS. Fill→face, immediate Delete and Undo, restored edge/face mode, Face-mode boundary expansion, empty-selection fallback and no-history picks included.
- Actual96-face public SubD box, Box/Smooth at1024×900 and1440×900: Face-mode double-click selects four edges and switches aria-pressed Edge. Fill produces96 faces and selects its new face with Face active. Re-clicking Face and pressing3 preserve that selection; immediate Delete removes that exact face; Undo restores it.
- Fill Undo restores four edges and Edge mode; Redo restores the face and Face mode. Cancel preserves document; final Done, document Undo/Redo and native Save/fresh Open preserve exact cage. Screenshot reviewed with the filled selected face.
- Frozen receipt SHA256 `7e89b44981ab7781f840d3e9618ac26c5803443f545b6ee3eededde6042eeb35`.
- Model/Studio type-check, focused lint, production build, diff check and independent review PASS.

## Limits / next

Existing active-button visual contrast remains separate #556; this change fixes semantic mode/selection state. General cage families, mirror, mobile/AT and full suites NOT_RUN. Existing generated-doc drift and unrelated App lint remain separate; CI not awaited. All HOLDs persist. Next D1325/#556: make Pick and Box/Smooth active state visible inside existing buttons, independently of pointer and keyboard focus.
