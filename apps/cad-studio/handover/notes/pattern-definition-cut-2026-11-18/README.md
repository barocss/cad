# Pattern definition edits preserve existing assembly cuts (#729)

Baseline: 6f35d6217. Current supported schema-3 native input can omit optional shared-definition `part` metadata. This is not a claim about the provenance of older files. Normal newly-created patterns receive shared metadata and were already protected.

Actual Studio Open → select seed → Edit part → Insert child → Finish previously accepted the edit (`Plate updated`). Both seed and copy became subassemblies, and the copy's hole disappeared while `cut1.targets` remained unchanged. The baseline browser failed its required refusal assertion, not a setup assertion. The source capsule had no changes and context/browser/server closed. Initial lightweight fixture used the normal pattern creator and passed because it supplied shared metadata; the narrowed fixture explicitly goes through native reading without that optional metadata.

The edit now checks actual changed recipients after pattern expansion using the existing cut guard and words. No saved cuts, shared identifiers, definitions, or old invalid data are automatically rewritten. Normal non-assembly edits and explicit cut removal remain available.

Verification status will be appended after the final frozen run. No full CAD parity or manufacturing qualification is claimed.

## Final verification
- Independent read-only review: no blocker.
- Focused and existing definitions/assembly-cut/frame-follow tests: **49/49 PASS**.
- Model and Studio TypeScript: PASS. Affected lint: PASS.
- Actual Chrome frozen fixed-02: **PASS**. Unsafe Finish keeps draft and explains cut1; Cancel/Discard restores original. Normal Width 40→45 updates both copies, Undo/Redo restores each state, Save/fresh Open retains the cut and hole.
- fixed-01 reached and passed refusal/recovery, but the positive-control fixture mistook the first Extrude editor field (Width) for Height. Corrected expectation/input, then reran the complete frozen browser flow. Product source did not change between runs.
- Final receipt changes=[], two contexts/browser/server closed; no owned process remains. Disk 29 GiB, above 2 GiB reserve. Local image pixels reviewed.

Commands: `node packages/barocss-cad-model/scripts/test.mjs pattern-definition-cut definitions assembly-cut definition-frame-follow`; both package TypeScript projects with `--noEmit`; affected-file ESLint; `PATTERN_DEFINITION_CUT_FROZEN=1 node apps/cad-studio/test/pattern-definition-cut-browser.mjs <output>` with documented Chrome/PW_DIR environment.

Scope excludes a separate, not-yet-reproduced partial-metadata revision-acceptance hypothesis. No broad assembly or manufacturing certification.
