# Circular X creation / History Count qualification (#25, partial)

Base: `8f90eb77cdc2e29e3cbec25d79a13eb50f616495`.

No production change was needed. The remaining Circular X Count case passes on the existing implementation. Added `test/circular-x-history-browser.mjs`, using the existing actual-Studio flow helper and an independent Python quarter-turn coordinate oracle adapted from the earlier circular-pattern qualification.

## Verified

Actual Chrome WebGPU at **1024×800 and 1440×900**, X axis, One body, disjoint 4×6×8 mm seed:

- Creation and History advertise the same integer Count range 2–4. Empty, 0, 1, 2.5 and 5 retain their draft values, mark the field invalid and disable Apply. Enter cannot change the document.
- Returning to Count 3 restores creation preview and applies three closed native solids within one output, total volume 576 mm³. History Count 4 applies four closed native solids at 90° steps, 768 mm³.
- Independent Python checks compare all eight corners of each solid with exact repeated X quarter-turns, shell closure and solid counts. These are bounded checks, **not a complete strict B-rep validator**.
- Undo restores Count 3 and its geometry; Redo restores Count 4 and geometry.
- Actual Save to an isolated browser OPFS project produces JSON exactly equal to the accepted document. Close project, page reload, project reattachment and Open restore the same Count 4 document and geometry. This is not a native-folder or downloaded-file round trip.
- **10/10 geometry oracle runs PASS** across creation, History, Undo, Redo and reopen at both sizes. No runtime/console errors, frozen-source changes or downloads. Narrow History refusal and wide reopened four-solid screenshots visually reviewed.
- Driver syntax and `git diff --check` PASS. This test-and-note-only change does not rerun the production typecheck/build or full test suite.

Run from `apps/cad-studio`, after the normal heavy-run gate, with `PW_DIR`, `CHROME`, and `CIRCULAR_X_HISTORY_FROZEN=1`:

```sh
node test/circular-x-history-browser.mjs <artifact-directory>
```

The inspector reads the same retained `<label>-doc.bcad` file passed to it. Read-only review caught and corrected an initial draft that saved an empty object while passing the model separately; that draft was stopped before any browser execution. The final run used the corrected file-backed inspector throughout.

## Remaining scope

#25 remains OPEN. This closes only its Circular X One-body Count qualification gap; arbitrary earlier-Subtract source application, other seed families, exact-half drag boundaries and other axis/path combinations are not newly qualified. Native-folder, schema/kernel expansion and all existing HOLDs remain unchanged. Original #126 WIP is untouched.
