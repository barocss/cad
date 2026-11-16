# #257: tolerance input units acceptance

The implementation already shipped in `b7e94defe8e9f0f3256afe426b023b869e4db546` (CI 43818578427 SUCCESS). This acceptance changes tests/documentation only, not product code, schema, numeric values or formatting policy. Length tolerance fields visibly say mm and explain the input unit accessibly even on inch sheets; angle fields say degrees; fit codes remain unitless strings.

## Minimum contract audit

- Four length kinds (linear/diameter/radius/PCD), symmetric/deviation, mm/inch with dual on/off: SSR proves visible mm, matching accessible description and unchanged raw values. Angle uses degrees, fit remains text. Incomplete drafts and extra precision are not reformatted during render. Four focused tests PASS; Studio tsc and targeted ESLint PASS.
- Actual desktop Chrome WebGPU, 25.4 mm box: input 0.254 mm displays `1.000 ±.010` inch. An explicit 0.010 control remains 0.010 mm, not inch. No-edit Enter preserves the entire document. Deviation +0.254/-0.127 mm displays +.010/-.005 inch. Angle ±0.5° and fit h6/H7 stay separate; fit edit Undo/Redo passes.
- mm/inch/dual transitions and dimension selection preserve authored tolerances, references and placement. Geometry nodes and outputs remain unchanged. OPFS Save completion is observed at the named file's successful writable.close, not inferred from an already-clean dirty indicator. Saved raw JSON equals the accepted document; Close, reload, project Open retains the whole document and labels.
- Actual saved file: 2,431 bytes, SHA256 `0d90f7678bff0d38f2c32e567f15970d73fd701836e376ce99cff84565524179`.
- In a separate process after browser exit, existing SVG/DXF memory writers consume the accepted symmetric document and actual OPFS saved JSON. One independent invocation passed both Python XML and DXF group-code readers with literal decimal conversion expectations, including standard DXF symbol escapes. The final companion invocation was killed, so reproducible writer acceptance remains BLOCKED. This is not an Export UI/download test.

## Evidence and reproduction

Browser artifact `/tmp/cad-tolerance-units-257-04/receipt.json`: PASS; all browser/server cleanup complete; native/console errors, source changes and downloads empty. Root visually inspected the symmetric and deviation screenshots; reopened screenshot also reviewed by the acceptance worker. `standalone-writer-receipt.json`: final FAIL (SIGKILL). An earlier standalone invocation passed both inputs, but the companion rerun overwrote that receipt; its successful contents were observed in tool output only and are not a durable final passing artifact. `writer-receipt.json` also remains FAIL.

Run browser and writer as **separate shell processes**, under the shared heavy gate; freeze all source writers for browser execution:

```sh
TOLERANCE_257_FROZEN=1 PW_DIR=/Users/user/.cache/barocss-playwright CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node apps/cad-studio/test/tolerance-units-257-browser.mjs /tmp/new-artifacts
node apps/cad-studio/test/tolerance-units-257-writers.mjs /tmp/new-artifacts
```

The accepted 04 browser flow is unchanged by final extraction of its post-cleanup writer into the companion script. That separation was syntax/lint checked and the companion executed against the same captured 04 artifacts, but its native child was killed. No redundant browser rerun.

## Failures retained, not hidden

01 stopped on an omitted title argument in the test's SVG writer call; default file title corrected, product unchanged. Independent inspection exposed missing DXF %%p/%%d decoding in the test reader; standard symbol decoding added without altering numerical expectations. 02's child process exited without recorded signal; 03 and 04 recorded SIGKILL for the native inspector launched by the browser harness process, even after browser cleanup. No OS/memory cause is established. The browser portion of 04 passed, while its same-process writer stage failed. The later standalone invocation succeeded once, but the final companion invocation again received SIGKILL. Stop further repetition and leave #257 OPEN for final independent output acceptance. The first browser attempts remain intact; the overwritten standalone success is explicitly not claimed as a final receipt.

Existing Model `drawing-units` substring suite: **27/28 PASS, 1 existing FAIL**. The failure is `drawing-units-golden` SVG/DXF hashes, with all six original dimension-data hashes unchanged. See `remaining-validation-triage-2026-11-16`; no golden update or tolerance widening. This is not a whole-suite green claim.

## Limits

Diameter/radius/PCD label coverage is component-level, not new native geometry family certification. The deliberately duplicated fixture dimensions have five overlap/completeness diagnostics; unit acceptance does not certify a complete production drawing. Existing selection/blur ownership and blank input recovery evidence remains in `tolerance-empty-2026-11-16`. Actual download/export UI, PDF, mobile, all browser backends and whole-suite testing are NOT_RUN. #35 numerical provenance and old output golden drift remain open; ASME/PDF and all other HOLDs, shared GPU code and the original eight #126 WIP files remain untouched. No new API, dependency or migration.
