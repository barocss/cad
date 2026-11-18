# Stored revision acceptance preserves driven-copy cuts (#731)

Baseline b0c0fa029. Supported schema-3 native document: seed has shared part metadata, its driven copy omits that optional metadata, no mates, and a pending revision is already saved. This is not a claim about file provenance. Normal newly offered UI revisions normalize copies and were already protected.

Actual Open → seed → Accept Rev B previously changed both occurrences to subassemblies at Rev B, removed pending, and lost the visible hole while retaining cut1.targets. The baseline document-equality assertion timed out because the accepted document actually changed, not because Open or the button failed. Screenshot and captured documents confirm this. Lightweight native/acceptance baseline: 1 expected failure, 2 passing controls.

Reuse #729's expanded actual-recipient guard at revision acceptance. It throws the existing VALUE refusal before returning the changed document. Pending candidate, original documents and cut records are retained. No automatic metadata repair or deletion. Dismiss and valid plain-part revisions remain supported.

Final validation: independent read-only review no blocker; focused and existing definitions/cuts/frame-follow regressions **52/52 PASS**; Model and Studio TypeScript PASS; affected lint PASS.

Actual frozen Chrome **PASS**: rejected Accept preserves the exact opened document and pending; Save/fresh Open retains the waiting candidate; Dismiss works; valid width 40→45 revision updates both copies, Undo/Redo and Save/fresh Open preserve the cut. Local screenshots reviewed. Final capsule changes=[], three contexts/browser/server closed, no owned process remains. Disk 37 GiB, above 2 GiB reserve.

Commands: `node packages/barocss-cad-model/scripts/test.mjs pattern-revision-cut pattern-definition-cut definitions assembly-cut definition-frame-follow`; both TypeScript projects with `--noEmit`; affected-file ESLint; `PATTERN_REVISION_CUT_FROZEN=1 node apps/cad-studio/test/pattern-revision-cut-browser.mjs <output>` with documented Chrome/PW_DIR environment.
 No full CAD/manufacturing qualification claimed.
