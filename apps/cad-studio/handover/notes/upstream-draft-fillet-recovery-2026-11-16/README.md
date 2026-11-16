# Upstream Extrude Draft → Fillet recovery (#157)

The historical 8° → 12° rejection is already fixed; this work does not claim to fix that kernel failure again. On the four-wall 40 × 30 × 10 mm rectangular Extrude with four-radius front-top Fillet, 12° → 35° currently refuses in the dependent Fillet with `unexpected kernel failure: Parameter is outside the knot domain`. Probes at 25°, 40°, and -10° accepted this fixture, so no monotonic angle limit or arbitrary range restriction was added.

History now recognizes a Draft-only Extrude edit whose failed Fillet depends on that Extrude. It displays one recovery notice at Draft, offers Reset or another angle, preserves the failed Fillet name and kernel diagnostic, and reuses the unchanged-refusal Apply/Enter guard. Unrelated feature failures and simultaneous geometry-property changes retain their existing diagnostics. Kernel support, stored documents, #126 and other HOLD scopes are unchanged.

## Verification

- Focused helper tests: 6/6 PASS (direct Draft and varying Fillet regressions included).
- Changed TypeScript and browser driver lint: PASS.
- Studio production TypeScript/Vite build: PASS.
- `drafted-extrude-variable-fillet-browser.mjs`: PASS at 1024×800 and 1440×900. Actual 35° refusal; single notice; failed Fillet identity; unchanged document; disabled Apply and Enter; Reset restores 12°; repeated refusal; 9° recovery preserves all Fillet controls and IDs; strict native B-rep and independent geometry/volume oracle; Undo/Redo; Save/Open and repeated oracle. Existing 8°/12° and varying-radius contact recovery remain in the same passing flow.
- Narrow-screen refusal screenshot inspected; notice is adjacent to Draft with the native detail retained behind its disclosure.
- Frozen-source receipt: PASS, no browser/console errors or source changes.
- Evidence directory: `/tmp/cad-upstream-draft-fillet-recovery-20261116`; build log `/tmp/cad-upstream-draft-fillet-build.log`.

This resolves recovery guidance, not the underlying 35° kernel limitation. Other models/angles and assistive technologies were not exhaustively tested.
