# D1927 — Link the original perpendicular annular outlet to a native plane

P5 [row 16](../../roadmap-rows/16.md) and [row 31](../../roadmap-rows/31.md), [#17](https://github.com/barocss/cad/issues/17). Base `95d2ad55141d788ea46ab9a49f0ed2417f101fc0`.

Offset face offers To plane on the original perpendicular annular outlet. The live binding uses the existing exact native reference, donor witness and same-prefix evaluation. It resolves the signed distance along the original outlet normal and calls the established exact Offset. Model recognizes this profile separately from the paired five-span caps. The existing document format and Kernel geometry remain in use.

- **FAIL, original desktop Studio.** The selected original outlet offered signed Distance only. The accepted original document was preserved.
- **PASS, current desktop Studio.** A nonparallel donor refuses before Apply. A real separate bottom face initially moves the original outlet to Z32 mm. Editing the same donor Move by −8 mm moves the outlet to Z24 and preserves the full stored witness. History then binds the opposite donor face at Z29. Undo, Redo and fresh Open preserve the original source signature and exact result. Opening a Z18 collapse case refuses without replacing the accepted part or donor.
- **PASS, independent native geometry.** Z32, Z24 and Z29 give 670.3268691074867, 594.9286454213301 and 642.0525352251759 mm³. Independent annular area and first moments agree within `1e-7`. The exact opposite inlet, both bends and 12 circular junctions keep the retained packets. The native body is strict genus 1 with 18 faces and a maximum pcurve gap of `7.11e-15 mm`.
- **PASS, affected checks.** Nine actual current Studio checkpoints and six each in the paired rectangular plane and annular Distance controls. Eighteen Model and ten Studio tests, Model and Studio types, scoped ESLint, Studio production build and diff check passed.
- **FAIL, earlier test harness.** The initial inspector had an extra closing parenthesis. The unconstrained viewport pick selected the nearby rim vertex. The final driver uses the actual Faces filter and verifies the body and face before opening Offset.
- **NOT_RUN.** Annular inlet To plane, native Replace, earlier finish and Boolean output targets, pinned Agent review of linked-plane edits, full local suites, mobile and paid providers. The wider #17 remains open. First mechanical CAD remains 8/10. Overall completion is unmeasured.

```sh
D1927_SOURCE_FROZEN=1 node apps/cad-studio/test/perpendicular-outlet-reference-plane-browser.mjs "$OUT/studio"
D1854_SOURCE_FROZEN=1 node apps/cad-studio/test/paired-outlet-reference-plane-browser.mjs "$OUT/paired-control"
D1924_SOURCE_FROZEN=1 node apps/cad-studio/test/perpendicular-sweep-inlet-offset-browser.mjs "$OUT/distance-control" --outlet
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test perpendicular-annular-inlet-offset offset-to-plane offset-plane-retention paired-elbow-outlet-plane-proposal-review
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test offset-cap-feedback offset-face-launch-view tool-contract-mcp offset-face-hud offset-plane
pnpm --dir apps/cad-studio build
git diff --check
```
