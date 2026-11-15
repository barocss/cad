# D1339 — STEP output admission (#139)

## Implementation

Every included root/placed output is checked before STEP writing. Empty native bodies/faces stop the entire export and name the affected output. Reliably identified Scale origins receive History/Factor guidance. Unsupported exact sheets also stop the whole export by name instead of silently omitting a valid open SubD beside a closed solid. Exact surface STEP support remains #16; this change adds no such format support.

The admission matches existing writer routing: faceted and mixed-face AP242 paths remain allowed. Root visibility does not change STEP scope; hidden occurrences remain excluded. Genuine empty Boolean operations with no output remain absent, distinct from an empty evaluated output. No geometry, tolerance or global strict-validation policy changed.

## Verification

- Model 43/43 PASS across STEP admission, scope, public, profile/bbox, native-name/loss and fixed-byte tests. Five new tests include controlled empty/mixed pre-writer admission, accurate Scale attribution, real evaluated open SubD with closed Box, hidden roots, visible/hidden occurrences and repaired two-solid STEP.
- Model/Studio tsc, focused ESLint, diff check and Studio production build PASS.
- Source-frozen Chrome/WebGPU at1024/1440: legacy failed Scale blocks download; History repair to0.005 restores actual STEP with2solids/12faces. Actual open SubD plus closed SubD is named and blocked in the STEP panel with no download; a native closed-cage counterpart restores2solid downloads. All exports preserve the document.
- Actual1024 refusal and restored screenshots reviewed. Refusal identifies Open SubD and the whole-export stop. Restored capture shows two solids, but retains an earlier transient “STEP not prepared” notice; downloaded bytes and receipt, not the screenshot alone, establish success. Notice lifetime was not changed here.
- Final receipt SHA256 `9b9a24e07b1f9e4d43c68780e6f89def106e1f25301df06c7b43e5b652a3c95a`. First browser run failed only because the driver attempted to close a panel already closed by successful download; conditional closing corrected the driver, final run PASS.

## Fixtures and limits

The two retained native fixtures originate from the earlier local D1331 open/closed cage runs, without private or authentication data. Closed SHA256 `36ab7af95f5fa261d83db41084855a71a55c342e9dd22c320b05cb7b704e00c4`; open SHA256 `5b8306d7b3a35036d49271386dbdf5f1ba23d0124db5c1379b1efe9b473f397f`.

D1337 now prevents the original empty Scale geometry. Controlled helper tests cover empty evaluated outputs, while real Model/browser runs cover valid unsupported exact sheets and legacy Scale refusal/recovery; no browser-state geometry injection was used. No external STEP reader, broad malformed topology, full suite, CI or manufacturing qualification is claimed. Existing HOLD remains. Next: #100 autosave Offset restore validation.
