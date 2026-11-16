# Full round history Along (#42 partial)

The saved `full-round` feature now exposes the creation command's Along choices: Longer side (automatic), X, and Y. Returning to automatic removes the optional field; parent, named faces and signatures remain unchanged. Unsupported values do not change the document. This adds no new kernel capability.

Validation:
- Full-round model tests: 4/4 PASS, including existing refusal/API checks and new history edits. A 30×12×20 box rounded along X and Y matches independent arithmetic `7200 - length * width² * (4 - π) / 8`.
- Actual Chrome WebGPU history browser at 1024×900 and 1440×900: PASS. Auto→Y preview leaves original document unchanged until Apply; actual body volume changes correctly. Undo/Redo, native Save/fresh Open, and Y→Auto restoration passed. Screenshot inspected.
- Focused lint and production TypeScript/Vite build: PASS.
- WebGL2, nonrectangular tops, and full aggregate browser suite not run.

Issue #42 remains open: face-thread length/pitch/hand history controls and the requested first-line thread diagnostics are not addressed by this commit. Protected #126 WIP is excluded.
