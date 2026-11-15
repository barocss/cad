# D1400 — reference file error recovery

## Cause and correction

Resolves #611 at Add reference file preparation. File reads and OBJ/STL parsing previously occurred before the reference tool error boundary. A rejected read or parser exception could therefore reject the UI event promise without a new notice.

A narrow preparation catch now shows the existing Reference not changed notice with the selected filename and actual cause. The original message remains in Details. The reference tool invocation stays outside that catch, so unrelated downstream commit exceptions are not mislabeled as file errors. Existing empty STL refusal, parsers, native admission, document ownership checks and general Open are unchanged. There is no empty-reference fallback.

## Verification

- Focused 12/12 tests PASS: seven file-error tests and five adjacent reference-placement tests. Real OBJ/STL parsing, repeated malformed/face-free input, new failure notice replacement, controlled byte/text read rejection, no-file guard and same-file retry reset are covered. Downstream commit exceptions still reject rather than being hidden.
- Native STEP regression exports a 2 × 3 × 4 block, passes its actual STEP text through File, addReferenceFile, the reference tool and native evaluatePart, then checks the committed source, reference ownership and independent volume 24 mm³. A separate fixture tests STEP/STP text routing only. No native STEP browser claim.
- Targeted lint and diff check PASS. Studio TypeScript and production Vite build PASS. These are focused checks, not full repository or CI qualification.
- Actual Chrome WebGPU at 1024 × 800 and 1440 × 900 PASS on the first run. Twelve failure attempts cover repeated bad OBJ, vertices-only OBJ, empty STL, malformed STL and a later OBJ failure. Each preserves the exact document and Undo/Redo enabled state. File preparation errors identify their current file; existing downstream empty STL copy stays unchanged.
- Actual valid OBJ and binary STL recovery, Undo/Redo, Save and fresh Open PASS at both sizes. Original stock nodes and outputs remain unchanged. Clearing the input exercises the no-file guard, not the operating-system picker Cancel UI.
- Root reviewed the 1024 error and 1440 fresh-Open screenshots. The filename and cause are readable, and both references survive reopening. Page errors, console errors and source changes are empty. Four contexts, browser and server closed cleanly.

## Evidence and limits

Browser evidence: `/tmp/d1310-publish.1Wqzsz/d1400-first`; receipt SHA256 `a0fbd837306b3f6a79f84fec29e9a3402e9a9450c6408370825305c63ff08671`.
Frozen product SHA256: `a1b64ebc0008b7628739c928f1120ca97ac06704c971bf71162eb9b49b4cbc03`.
Production build log: `/tmp/d1310-publish.1Wqzsz/d1400-build.log`.
The native STEP unit test was added after the browser closed; product source stayed identical. OS file-read failures are controlled unit tests, not actual OS failure injection. Native STEP is not part of this browser run. No general Open, accessibility, cross-browser or whole-CAD qualification is claimed. Existing HOLDs remain, including #608 Rendering. Next: #612 drawing hidden-ink duplication with persistent source identity preserved.
