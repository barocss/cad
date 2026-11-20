# Retain a terminal Fillet after a History height change (#20)

**Reproduction.** A 40 × 30 × 10 mm box has a circular Fillet on its front top edge. Start and End radii are 1.25 and 2.5 mm. Two intermediate radii are 3 mm at 25% and 1 mm at 62.5%. Before this change, Studio accepted a 16 mm extrusion height and showed a valid fillet. The stored edge signature still placed the edge at Z=10. Reopening the saved file suppressed the finish and increased the volume from 19164.576645650257 to 19200 mm³.

**Decision.** For a signed top edge of this plain box with numeric interior controls, evaluate the original reference guard first. After it succeeds, prove the old and new parent topology, edge identity and endpoint assignment. Refresh the signature and evaluate the result before committing. Preserve the authored controls. A failed proof leaves the document intact.

**Actual desktop Studio, PASS.** History accepted 10→16 mm. Undo, Redo, file Save and Open in a fresh browser context preserved the expected native result. Seven sections agreed with the independent quarter-round contact positions within 1e−6 mm. Native and displayed volume agreed with the section integral within 1e−7 mm³. The reopened shape had one solid, 14 faces, 36 edges and 24 vertices. Its four station markers were at X=0, 10, 25 and 40 mm, all at Z=16. Height 10→30 retained the original REFERENCE_MOVED refusal. An unrelated missing edge remained held on Open.

**Checks.** Run the Studio test runner with the rectangle finish resize, varying and bound finish height, parameter height and History finish owner filters. The focused regression covers heights 15/16, native refusal at 30, a stale signature, a reversed native edge and file round-trip. Run the Studio production build and lint the changed paths.

For the actual driver set `RECTANGLE_INTERIOR_HEIGHT_REOPEN_FROZEN=1`, `PW_DIR` and `CHROME`. Run `node apps/cad-studio/test/rectangle-interior-fillet-height-reopen-browser.mjs <fresh external directory>`. Add `--baseline` with source at `744447181`. Broader reference and Flange acceptance in #20 remains open.
