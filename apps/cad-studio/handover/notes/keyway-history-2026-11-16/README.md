# Keyway history dimensions (#32 partial)

Added Width, Depth and Angle history fields for existing keyway nodes. Edits preserve parent/face and all preceding nodes; zero angle restores the omitted default. Width/depth share positive-mm validation between creation and History; angle remains signed and allows zero. No schema or geometry kernel changes.

Verification: focused model test 1/1, Studio numeric test 1/1, existing shaft-parts regression 3/3; focused product ESLint and Studio TypeScript/Vite build passed. Chrome WebGPU browser driver `test/keyway-history-browser.mjs` passed at 1024 and 1440 widths with a Ø40/20 ×22 tube: zero-width Apply refusal, 6×2.8 at 0° to 7×3.4 at 90°, preview document unchanged, applied volume reduction, parent/face preservation, Undo/Redo, Save/Open and restoring zero angle. Accepted 1024 screenshot visually reviewed. Local result `/tmp/cad-keyway-history-20261116`; build log `/tmp/cad-keyway-history-build.log`.

#32 remains open: open-slot/floor diagnostics, Pipe boundary messaging, and Retaining ring preview framing are not implemented or verified by this change. No claim of a full issue pass, WebGL2 pass, export or all-suite coverage. #126 held files and Print/Physics/Rendering HOLD untouched.
