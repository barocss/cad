# D2268 — Extract Studio command launch routing from App

P4 [row 12](../../roadmap-rows/12.md) and [row 22](../../roadmap-rows/22.md) · [#44](https://github.com/barocss/cad/issues/44) · Base `b87a0151b`.

- **Decision.** Move command admission, workspace routing, initial native measurement and feature entry into the Studio command launch module. Keep current document, request ownership, editor state, and async evaluation in the originating App callbacks. Preserve callback identity and the existing checks, refusal and dispatch order. App decreases from 2,181 to 2,143 lines.
- **PASS, actual desktop.** Before and after, the same Studio sequence creates a native Sketch circle, opens an exact Sweep, previews and applies, refuses axis contact, edits the upstream width, runs Undo/Redo, saves and opens a fresh project document, and previews and cancels a native Fillet. All seven visible state records match in full, including document, bodies, selection, notices, History and command/editor fields. Three native records match byte for byte. Zero console errors and 1,309 source pins in the final run.
- **PASS, automated.** Node 22.19.0 passed 108 affected Studio cases. Studio types, changed-file lint and production build pass.
- **NOT_RUN.** Full local kernel and broader desktop suite, mobile and live models. Other desktop checklist issues retain their own existing evidence and scope.

```sh
bash "$OUT/desktop.sh" baseline
bash "$OUT/desktop.sh" extracted
bash "$OUT/validate.sh"
git diff --check
```
