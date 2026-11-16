# Text relief containment recovery (#40 partial)

## Reproduction and scope

Parent2beadae230535e673f98f0fbc1d4d271681020b1. A real local ABeeZee A glyph on a40×30×10 box refuses at Baseline X/Y=-100. Native detail is `profile relief component leaves the selected cap or target material`, but the default HUD showed only “The kernel could not build this” and generic retry help. The detail had to be expanded to learn containment was the cause. Model baseline12 existing tests PASS/new guidance regression FAIL, `/tmp/cad-relief-repro.log`. Actual baseline02 reproduces the generic first-line message with source preservation.

The shared Model friendly-error adapter now maps only GEOMETRY with either of the two exact native containment messages (`component leaves...` or `exact containment leaves...`). It identifies text outside the selected face and suggests Baseline X, Baseline Y or Em size so every stroke stays in remaining material. Raw detail/code and feature ownership remain intact. Clearance, component overlap/contact, depth and capability failures are not relabelled. Kernel admission, geometry, tolerance, reference recovery and commit/preview flows are unchanged. No broad relief support or manufacturing work is added.

## Verification

- Model native14/14 PASS, including real invalid native geometry/document retention and exact-message/code boundaries. Model TypeScript and affected ESLint PASS.
- Actual frozen Chrome1024×900 and1440×900 PASS: real top-face pick, existing local font input, valid preview→outside refusal, exact title and complete help visible while Kernel detail remains closed, Apply disabled and accepted document unchanged. Expanded detail is the original message. Baseline5/5 recovery→Apply→Undo/Redo and History invalid draft→Cancel preserve exact documents. Screenshots reviewed; errors/console errors/source changes/downloads empty. `/tmp/cad-text-relief-containment-after`.
- Studio consumer TypeScript and production build PASS. No full suites, new file/export proof or broader geometry claim.
- First browser attempt waited for the wrong literal status `error`; screenshot already showed the genuine generic `refused` state. Driver was corrected to the actual status, baseline02 passed. Initial output `/tmp/cad-text-relief-containment-before` is retained, not called a product runtime failure.

Run Model `node scripts/test.mjs text-relief-engine`; Studio `TEXT_RELIEF_CONTAINMENT_FROZEN=1 PW_DIR=... CHROME=... node test/text-relief-containment-browser.mjs OUTPUT`, under the shared heavy lane with Node22. Add `--baseline` only on the reproduced parent.

#40 stays open for its separate held Print portion. Thread History and Interference scope already have their own completion notes. Protected #126 WIP and all HOLDs remain unchanged.
