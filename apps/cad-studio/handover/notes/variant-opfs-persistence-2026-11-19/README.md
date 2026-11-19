# #256: numeric variant OPFS persistence qualification

Evidence-only branch; product baseline `2c9897b87ab1dfa3519dff386dd7d18176b72587`. No product change, export repetition, assembly run, native-folder access, permission change or new CI. #256 remains OPEN and all original HOLDs remain.

## Exact accepted slice

Reused the independent numeric A/B box fixture:10×5 footprint; A master HeightA20 with unsaved size40, independent B master HeightB10 with saved active Tall22. On B, explicitly save size24 as Persist24. The very first Undo removes Persist24 and returns Tall22; first Redo restores the exact Persist24 document.

Public browser-project Save writes actual OPFS bytes (1,127 bytes) containing master HeightB10, Tall22, Persist24 and active Persist24, with no A binding/value contamination. Readback SHA-256: `846ca54596083d077a9b6d722ea102200bfce57638b2853797f446180e6675eb`.

Close project, reload the page in the **same context and origin**, reopen the named browser project, then open its exact B-variant.bcad row. This is not a new-context file import or cold browser-process restart. First and all observed reopened B evaluation requests contain HeightB24 (one request), never HeightA or40. Explicit Show the master gives HeightB10; the saved OPFS bytes remain unchanged at Persist24.

Independent Python literal oracle: P24 volume1200 and centroid[5,2.5,12]; Tall22 volume1100 and centroid[5,2.5,11]; Master10 volume500 and centroid[5,2.5,5]. Full authored documents are compared separately from rendered geometry. Retained screenshots show the fresh-page Persist24 result and explicit Master10.

## First attempt and verification

First run passed variant save and FIRST Undo/Redo but stopped before OPFS: the driver tried Project while Variants remained open. Current UI intentionally makes those panels mutually exclusive. Corrected only the driver to use public Close Variants before Project; no document/active-value change. First-run persistence was NOT_RUN, not a demonstrated product persistence defect.

Complete corrected run PASS:594 source hashes unchanged through cleanup; no page/console errors, watched source changes or downloads; context/browser/server closed. Driver syntax, scoped ESLint and diff check PASS. Screenshots were visually reviewed. No product types/build rerun for this standalone evidence-only JavaScript file.

Replay `test/variant-opfs-persistence-browser.mjs` with the existing flow-helper, local Chrome/Playwright, Node22.19.0, standard source-freeze environment and exclusive on-device gate. Retain raw artifacts outside the repository. No shared checkout edits or production assets are needed.

## Still open

This clears only the named numeric B Save variant→FIRST Undo/Redo→OPFS Save/Close/fresh-page Open remainder. Other accepted entry combinations (template/version/recovery/in-place, cancellation/refusal/repetition coverage) and broader typed/assembly persistence remain unqualified. Prior numeric/boolean/choice/late-response/export evidence retains its original scope. No blanket #256 completion claim.
