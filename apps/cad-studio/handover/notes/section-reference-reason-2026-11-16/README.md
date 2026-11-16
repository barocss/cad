# Missing section references do not prove source deletion

Bounded #34 checklist item 260. Baseline `e4ab47cbb26b534aa84cc2588c513691f255c936`.

## Reproduction and contract

The native 60 × 40 × 10 block retains its Hole at (15,10), radius 3, and the original 10 mm section-wall dimension. Moving section A from Y10 to Y20 removes that wall from the section, not the Hole from the part. The old diagnostic nevertheless claimed the measured edge was no longer in the part.

Missing linear/angle edges and radius/diameter circles now say that the reference cannot be found in the **current section**, and ask the person to check section position and the source feature. A failed section PCD says its holes cannot be resolved as one circle there, preserving ambiguity between missing references and a non-circular set. This does not infer topology provenance, assert that the source still exists in every case, rewrite references or automatically reconnect anything. Base-view messages and distinct missing-view/section, coincident, parallel, non-round and Detail crop paths remain separate.

## Verification

- Native focused 2/2 PASS: moving the section off the unchanged Hole and restoring it; absent section has its distinct message; section missing angle/radius/diameter/PCD scope, base messages and coincident diagnosis retained.
- Actual Chrome baseline `/tmp/cad-section-missing-baseline-02` reproduces the false part-deletion wording through the Section Y input.
- Actual fixed `/tmp/cad-section-missing-fixed-02`: Y10→20 shows the scoped instruction; first Undo restores 10 mm; Redo and New part→in-memory .bcad Open retain the scoped warning; Y20→10 restores the original dimension. Nodes and authored dimension references are unchanged. No downloads, page/console errors or watched-source writes.
- Screenshot visually reviewed after scrolling the issue into view: the section misses the Hole, the Hole remains in the part views, and the warning is present. Full instruction text was asserted from its actual DOM content.
- Exact local Model export aliases and native export aliases were used for the fixed browser and production build, avoiding shared installed-source resolution. Build PASS (4.29 s; existing warnings retained).
- Native-alias affected-source tsc, lint and diff-check PASS. This is not a default full-package tsc or hosted CI claim.

First failures retained: baseline browser run 01 assumed a `sections` array after editing, but `withSections` intentionally normalizes one front A section into legacy `section.y`. The driver now accepts both authored encodings. Initial type-check identified test-only readonly tuple mismatches; explicit mutable Vec3/XY fixture tuples fixed them. Fixed browser run 01 passed behavior; run 02 adds issue-panel scrolling for visual inspection. No production change followed the browser verification.

## Remaining boundaries

#34 remains open for its other independent Detail/sheet/export/reconnection acceptance boundaries. This fix gives accurate scope and next checks, not an unproven definitive classification of section movement versus source deletion. No kernel/schema/golden, physical export, native-folder, #35 precision or held feature changes. Original #126 WIP remains untouched.
