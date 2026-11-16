# Pipe bend angle (#32 partial)

The Pipe creation control advertised up to 270°, but `part-profile-solid.ts` accepts only (0,180]. Align its numeric bounds and add explicit exclusive-zero/inclusive-180 guidance. Reject zero, over-limit and non-finite values locally without attempting preview/apply; positive sub-degree angles remain allowed. No kernel capability or schema change.

Validation: model boundary test 1/1 (0, 0.5, 90, 180, 180.01, 270 against actual evaluation); numeric rule test 1/1; focused lint and Studio TypeScript/Vite build PASS. Browser `test/pipe-angle-browser.mjs` PASS at 1024 and 1440, using radius5 circle, radius20 bend and two 8mm runs: 270/0/180.01 refused with visible range and disabled Apply, Enter leaves doc unchanged, recovery to 180° preview/apply, Undo/Redo, Save/Open. Refusal screenshot inspected. Results `/tmp/cad-pipe-angle-r3-20261116`, build `/tmp/cad-pipe-angle-build.log`.

Harness attempts 1/2 failed on palette focus and an incorrect expected status label respectively; corrected to blur the prior history control and wait for the actual `preview` status. Final frozen run passed. No product workaround was introduced for these harness errors.

#32 remains OPEN. Equal-radius bend behavior, open-slot/floor diagnostics and Retaining ring framing are separate remaining scopes, not claimed fixed here. No full-suite or WebGL2 validation. #126 WIP and existing HOLDs untouched.
