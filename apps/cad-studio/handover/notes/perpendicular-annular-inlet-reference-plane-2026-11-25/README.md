# D1960 — Link the original perpendicular annular inlet to a native plane

P5 [row 16](../../roadmap-rows/16.md) and [row 31](../../roadmap-rows/31.md). [#17](https://github.com/barocss/cad/issues/17). Base `04ed69f49fd986d4141e9660678005366cfb60d0`. Full native consumer change in Model.

Offset face accepts To plane on the original inlet of the exact four-span perpendicular annular Sweep. The existing inlet frame derives the signed displacement from the current parallel donor. The existing native inlet Offset, saved face signatures and donor ownership checks remain in use.

- **FAIL, previous Studio.** The original inlet offered only signed Distance.
- **PASS, desktop Studio.** The Top donor refuses as nonparallel. The donor's side moves the original inlet from X−10 to X−14 mm. Move the same donor +8 mm in X and the inlet follows to X−6 mm. Reselect the opposite donor side in History and the inlet moves to X−11 mm. Undo, Redo, Save and fresh Open pass. A separate input that moves the donor plane to the first bend at X0 mm refuses and leaves the open document intact.
- **PASS, independent native geometry.** The area is (3π) mm². The total path length is (15π+20+d) mm with signed inlet displacement (d=-10-X). At X−14, X−6 and X−11 mm, the exact volumes are 670.3268691075, 594.9286454213 and 642.0525352252 mm³. Independent first moments agree within 1e-7 mm. The outlet, every non-lead face packet and all 12 charted junction edges remain identical. The body has 18 faces, 36 edges, 20 vertices and genus 1. The largest edge-surface gap is 7.11e−15 mm.
- **PASS, current controls and reader compatibility.** The signed inlet Distance flow and existing outlet To plane flow pass. Five native outlet records match D1927 byte for byte. The exact previous reader accepts the outlet control and explicitly refuses the new linked inlet before replay. Coplanar donors and contact with the retained join refuse in Model.
- **PASS, affected checks.** 19 Model and 10 Studio checks, affected types, Studio build, scoped lint and diff check.
- **FAIL, corrected driver assertion.** The initial signed-distance control expected a hidden Mode field on the inlet. The final control verifies that Distance is still the selected mode.
- **NOT_RUN.** Native Replace, chained caps, explicit local Agent approval of a linked inlet, STEP, full local suites and mobile. #17 stays open. First mechanical CAD remains 8/10 accepted. Overall CAD stays unmeasured.

```sh
D1960_SOURCE_FROZEN=1 node apps/cad-studio/test/perpendicular-outlet-reference-plane-browser.mjs "$OUT/prior" --inlet --baseline
D1960_SOURCE_FROZEN=1 node apps/cad-studio/test/perpendicular-outlet-reference-plane-browser.mjs "$OUT/studio" --inlet
D1927_SOURCE_FROZEN=1 node apps/cad-studio/test/perpendicular-outlet-reference-plane-browser.mjs "$OUT/outlet-control"
D1921_SOURCE_FROZEN=1 node apps/cad-studio/test/perpendicular-sweep-inlet-offset-browser.mjs "$OUT/distance-final"
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test perpendicular-annular-inlet-offset offset-to-plane offset-plane-retention paired-elbow-outlet-plane-proposal-review
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test offset-cap-feedback offset-face-launch-view tool-contract-mcp offset-face-hud offset-plane
pnpm --filter @barocss/cad-model type-check
pnpm build
git diff --check
```

The prior reader uses the unchanged migration entry with the exact base `doc.ts` guard. Evidence files stay outside Git.
