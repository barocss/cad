# D1394 — owned Print layer-height draft

## Scope and policy

Resolves #604. PrintLayerHeight keeps raw editing separate from saved Print settings. Finite positive Enter or blur commits; Escape restores the saved value. Empty, zero and negative drafts stay visible with linked invalid feedback while the saved preview stays in force. A valid changed draft identifies the value still used by Preview. Document identity and saved-value changes reset the draft, including same-value Open and Undo/Redo. Clearance, worker algorithms, schemas and manufacturing scope are unchanged.

Normal valid blur commits before Preview None or Set height off. Turning the setting off then removes it; these are separate legitimate history steps. Invalid unsubmitted drafts cancel on unmount. Enter followed by Tab makes one setting change. Native number inputs control partial decimal serialization: Chrome reports typed `0.` as `0`; no promise of verbatim partial text across browsers is made.

## Verification

- Focused component/constraint tests: 8/8 PASS. Targeted component/test ESLint and diff check PASS.
- Studio TypeScript and production build PASS. Full App lint retains the unrelated baseline unused `_k` at line 2416; no full-App lint pass is claimed.
- Actual Chrome WebGPU at 1024×800 and 1440×900: select-all, clear, sequential 0.35 without appending the old 0.301; saved-preview feedback; zero Enter and negative blur; Escape; valid blur and invalid unmount; same-value Open and Undo/Redo ownership reset; one Undo after Enter plus Tab; Set height off/on; 0.35 Save/fresh Open and contours PASS.
- Bulk insertText exercised paste-like replacement, not the operating-system clipboard.
- Adjacent #603 browser regression PASS at both widths: finite-positive native validity and current worker result, actual arrows/spinner 0.3 → 1.3 → 0.3. Clearance remains unchanged and ephemeral. The Print driver now explicitly commits after draft edits before checking worker results.
- Source frozen throughout both browser runs; no console/page errors or source changes. Dirty/invalid feedback screenshots and adjacent small-value screenshots were reviewed as readable.

## Evidence

Local main run: `/tmp/d1310-publish.1Wqzsz/d1394-first`; receipt SHA256 `e9148c045f5a6085cea019bc5b869a6bc771036d80374fa9133826030f4f5ac3`.
Adjacent regression receipt SHA256 `41b7530750b7f288ce5847ffec5b6cc57486410d19f3e3dcdc9ec33f00911780`.
Build log: `/tmp/d1310-publish.1Wqzsz/d1394-build.log`.
No mobile, assistive-technology, cross-browser or whole-CAD acceptance claim. Existing HOLDs remain unchanged.
