# D1413 — Legacy two-section Loft automatic name

## Scope and result

Fixes #616. Unguided/unframed two-section automatic labels omit the ineffective smooth suffix, matching effective Ruled mode. Existing document flags, user body names and native geometry are not rewritten. Guided/framed own-property contracts remain unchanged; malformed sections do not acquire the correction. Three-section Smooth retains its suffix.

## Implementation

- `packages/barocss-cad-model/src/engine/doc.ts`: bounded automatic label correction only.
- `packages/barocss-cad-model/test/loft-legacy-label.test.ts`: effective mode, own-property boundaries, native/document/name preservation.
- `apps/cad-studio/test/loft-two-section-mode-browser.mjs`: extends the existing two-section flow with legacy flags, public rename, Undo/Redo and named/unnamed Save/fresh Open; three-section Smooth control.

## Verification

- Focused Model tests: 33/33 PASS, including three new cases and retained bodies/guide-command/API cases.
- Model and Studio type checks, focused lint, browser-driver syntax, production build and diff check PASS.
- Actual Chrome WebGPU: 1440×1000 and 1024×800 PASS. Current and legacy two-section names agree with History; explicit `Workshop frustum` survives Undo/Redo and Save/fresh Open. Legacy `smooth:true` remains in the document. Three-section Smooth name/mode and reopened document remain intact.
- Twelve native conical-frustum checks: strict validity, one body, volume 1319.4689145077127 mm³ versus independent `420*pi` = 1319.4689145077132 mm³ (tolerance 1e-6 mm³).
- Visually reviewed `1440x1000-legacy-effective-ruled.png` and `1024x800-user-named-legacy-reopened.png`: consistent label/mode and visible frustum; explicit body name visible after reopen.
- Local artifact set `d1413-first/receipt.json`: SHA256 `16e922e20a564080307c8cdd92079d8b11836e4dd272c4052729dd1f51694410`. 962 frozen sources; zero source changes, page errors or console errors; ten contexts, browser and server closed. Driver SHA256 `7b04f5298707979cf82df34a1e530d7f7a0ff4a33fc209fdf77e2997a069e3cb`.

## Boundaries

Synthetic unguided coaxial circles only. Three-section Smooth is a naming/mode/document control, not a general geometry qualification. Guided/framed behavior is covered by focused contract tests, not a new browser breadth claim. No kernel changes, document migration, whole-CAD completeness or full CI pass is claimed. Existing six Drawing baseline failures, inventory drift and HOLDs remain unchanged.
