# Measurement details keyboard path (#41)

Alt+M in Model measurement mode opens a collapsed Dock and focuses Pin measurement, or Clear pinned measurement after pinning. Before a pinnable pair exists, it focuses the result panel itself. Both panels and shortcut help expose the shortcut. Selection does not automatically steal focus; input/select/textarea/contenteditable targets retain their native keys. No model, measurement, or persistence semantics changed.

## Verification

- Chrome/WebGPU, final `measure-context-pin-browser.mjs`: PASS at 1024×800 and 900×760.
- Real opposite caps of a 20×12×8 extrusion: context Measure, Alt+M → Pin → Enter; pinned 8 mm. At 900 pixels with Chat open: close Dock, retain canvas label, Alt+M reopens details, focuses Clear, preserves document. Repeat close/open; Chat autonomy select retains focus on Alt+M.
- Extrude edit to 13.25, independent selection, Undo/Redo, Alt+M → Clear → Enter all PASS, with unchanged document after pin/clear and no downloads.
- Screenshots inspected for narrow Chat-open Dock: measurement details and shortcut visible.
- Focused component/test lint and `git diff --check`: PASS. Studio production build: PASS. App-wide lint has the existing unrelated `_k` finding; not a clean aggregate lint claim.
- Initial narrow test used the offline Chat textarea, which is disabled, and later tried History while narrow Chat hid it. Corrected test to use the enabled select and close Chat after the narrow-layout assertions, without changing app behavior.

Live Chat textarea input, keyboard-only face selection, WebGL2, and full browser aggregate suite were not run. No Chat server, network model call, provider configuration, or credentials were used. Protected #126 changes were not included.
