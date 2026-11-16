# Render unavailable guidance (#52)

Base bb14e84c8a0400ca78ac80b5be8d80d9ea29ec0a; 2026-11-16.

One Render-top notice explains WebGPU requirements, blocked rendering/export/focus-pick controls and continued modelling/settings use. It is in the keyboard tab order and referenced by the disabled controls via aria-describedby. Unavailable Path tracing no longer displays its still instructions, empty sample count or denoise setting. Camera retains local editable/saveable focus/blur guidance without repeating the renderer requirement. Enabled rendering behavior is unchanged.

Validation:
- App build and focused lint PASS.
- render-focus plus new RenderPanel error/retry unit regression: 2/2 PASS. The latter injects a rejected session factory into the real component with a bounded hook harness: error alert visible, Start unlocked, retry clears the old error while busy and displays the next failure. This is not a physical GPU/device-loss test.
- render-unavailable-browser PASS at 1024x900 and 1440x900, actual data-renderer=webgl2 selected with the query parameter. Single WebGPU explanation, keyboard focusable reason, aria-describedby links and disabled Start/Export/focus-pick, hidden empty samples/instructions; Focus 72 mm and Blur 6 px persist through actual Save/fresh Open; returning to Model allows face selection.
- WebGPU focus-pick next-action text and Cancel leave the document unchanged.
- Existing assembly-cut-path-trace-browser PASS: actual WebGPU Start/progress/Stop/exported PNG, accepted assembly vs unapplied cut draft and diameter edit. Frozen-still/native scene comparisons retained.
- Inspected narrow blocked-render screenshot.

Evidence: /tmp/cad-render-unavailable-20261116, /tmp/cad-render-unavailable-gpu-20261116; /tmp/cad-render-unavailable-build-final.log.
Limits: forced WebGL2 is not an actual WebGPU initialization failure. No screen-reader/mobile/device-loss claim. No renderer, export or model geometry implementation change. Protected #126 WIP excluded.
