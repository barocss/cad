# Mirror plane-pick guidance (#53)

Base: f1d103b9722c1ca615024366d2b53f2bc365d068.

Mirror's normal HUD no longer repeats numeric plane inputs as a step. A picked original face remains identifiable. While selecting a replacement, the step names eligible original planar faces and says Cancel plane pick restores the previous preview. A prior face is labelled Previous face; the button changes to Cancel plane pick. Invalid-edge feedback in this mode no longer tells the user to enter the mode they are already in. Toggling pick mode clears only this command's obsolete input-pick toast.

Validation (2026-11-16):
- TypeScript/Vite app build PASS.
- Focused lint PASS for Hud, model commands and browser driver. App.tsx retains the single pre-existing unused _k error, confirmed against base HEAD; no whole-App lint pass claimed.
- Final mirror-original-plane-browser PASS at 1024x900 and 1440x900: native 40x24x10 box with diameter-4 hole, original bottom Z=0 rather than generated preview top; invalid original edge leaves fields/document unchanged; Apply disabled during picking; Enter on Cancel plane pick restores preview without applying; repeat picking succeeds; owned obsolete notices clear; Apply, Undo/Redo, actual Save/fresh Open preserve native geometry. Escape while picking cancels the whole Mirror command without altering the document.
- Native checkBrep strict validity, analytic mirrored volume/centroid and vertex bounds checked before/after reopen.
- Inspected final 1024 pick-mode screenshot: eligible-face instructions and Cancel plane pick visible, obsolete toast absent.
- Evidence: /tmp/cad-mirror-pick-r3-1024-20261116 and /tmp/cad-mirror-pick-r3-1440-20261116; build /tmp/cad-mirror-pick-build-final.log.

Earlier intermediate browser passes exposed an old pre-mode refusal toast in the screenshot; final implementation clears that owned notice on pick-mode toggle and both widths were rerun. No placed-part, non-axis plane or screen-reader claim. No new geometric support. Protected #126 WIP untouched.
