# D1924 — Offset the original perpendicular annular outlet

P5 [row 08](../../roadmap-rows/08.md), [row 16](../../roadmap-rows/16.md) and [row 31](../../roadmap-rows/31.md), [#17](https://github.com/barocss/cad/issues/17). Base `014c5c03666d304348e0dc6cbf11a26559d741dc`.

Signed Offset face now moves the original straight outlet of the four-span perpendicular Exact Sweep with one concentric bore. The inlet and outlet use the same native proof and each keeps its own original face authority. The Kernel replays the original body before moving the last two rail poles. It certifies both cap rims, all three original circular joins and every retained native boundary packet. The existing signed Offset document format carries the edit.

- **FAIL, original desktop Studio.** The actual pick selected `n1.end` with outward +Z. Offset face refused the annular loops and Apply stayed disabled. The original document was preserved.
- **PASS, current desktop Studio.** Apply +4 mm to move the outlet from Z28 to Z32. History refuses −10 mm where the cap would reach the bend, while the last applied document stays unchanged. Edit to −4 mm at Z24, then Undo, Redo, Save and fresh Open. The native source signature and exact resulting body remain current. The earlier signed inlet flow still passes. Each end has six actual checkpoints.
- **PASS, independent geometry.** +4 mm gives 670.3268691074867 mm³ and centroid (8.471724595624, 16.386711706298, 7.503639232238) mm. −4 mm gives 594.9286454213301 mm³ and centroid (8.024568957359, 14.661432945942, 4.906034955132) mm. Independent annular area and rail first moments agree within `1e-7`. The original inlet, both bends and all three joins retain their native packets and names. All 12 junctions remain tangent. Both R2/R1 rims preserve exact circles. The results keep strict genus 1 and maximum pcurve gap `7.11e-15 mm`. The native minimum-length control admits the exact 0.0001 mm terminal span and refuses contact, crossing and unrepresentable movement.
- **PASS, checks.** Sixteen native, 35 Model and 10 Studio focused checks. Kernel, Model and Studio types, Kernel library build, Studio production build and scoped lint pass.
- **FAIL, earlier test harness.** A redirected test document lacked the tuple type. The first outlet History check passed the original document as the current context and was refused as stale. The final test uses the actual reopened document. Four identifiers omitted by the native incidence comparison needed unused-binding names for ESLint.
- **NOT_RUN.** Linked-plane Offset, general curved walls, a second cap edit after an Offset, earlier Boolean or finish targets, full local suites, mobile and paid providers. The parent #17 remains open. First mechanical CAD remains 8/10. Overall completion is unmeasured.

```sh
pnpm --dir packages/barocss-cad build:library
node --test packages/barocss-cad/test/exact-perpendicular-{annular-inlet-offset,annular-outlet-offset,both-ends-sweep}.test.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test perpendicular-annular-inlet-offset paired-elbow-outlet-offset-handle offset-to-plane offset-plane-retention native-offset-face
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test offset-cap-feedback offset-face-launch-view tool-contract-mcp offset-face-hud offset-plane
pnpm --dir apps/cad-studio build
D1924_SOURCE_FROZEN=1 node apps/cad-studio/test/perpendicular-sweep-inlet-offset-browser.mjs "$OUT/studio" --outlet
D1921_SOURCE_FROZEN=1 node apps/cad-studio/test/perpendicular-sweep-inlet-offset-browser.mjs "$OUT/inlet-control"
git diff --check
```
