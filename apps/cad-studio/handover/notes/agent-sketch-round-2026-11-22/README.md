# D1693 — Propose a straight-corner sketch Round

P1 sketch authoring and Agent tools, rows 04, 09 and 16. [Issue #21](https://github.com/barocss/cad/issues/21).

The revision-pinned feature edit now accepts `sketchRound` with the saved sketch ID, two incident straight side IDs and a radius in mm. It uses the same corner construction as Studio and the existing proposal, reference rematch and rebuild. The automated edit refuses a corner whose fixed point or trimmed edges would lose a driving constraint. The guards check finite carrier contact, radius, tangency and the native profile. They check contact with nonincident edges both before and after settlement. The manual Round action and the separate pinned line–arc cases keep their existing behavior.

## Verification

- **FAIL, parent capability.** Local L1 MCP at `1bc9a93f153f6a1bbb288f00afc9dbfbf9838da2` returned `UNKNOWN_ARGUMENT` for `sketchRound`. The source file bytes were unchanged.
- **FAIL and corrected, geometry admission.** The existing straight Round permits removal of a trimmed length lock. The legacy sampled native loop check also accepted an R10 reflex round with a nonincident tip exactly on the new arc. Settlement could move that tip by about 0.44 µm and conceal the contact. The Agent edit refuses both cases and the same reflex outline accepts the clear R9 control. Tests cover clockwise wraparound and interior arc tangency with a separated control.
- **PASS, local MCP.** The read discovered `n0`, `e1` and `e2` at (40, 0) in sketch mm. Dry run reported −77.257 mm³ at the tool's three-decimal precision. Missing revision, wrong sketch, nonincident pair, R30, a locked carrier, simultaneous Round and Chamfer arguments, stale revision and L1 approval attempts refused. The negative controls kept the source or pending file bytes unchanged.
- **PASS, actual desktop Studio WebGPU.** The 40 × 30 mm outline with a 10 mm Extrude stayed at 12000 mm³ until explicit approval. Preview showed −77.26 mm³. The accepted R6 solid had volume 11922.743338823082 mm³. Its one native cylindrical wall, `n1.side[e5]`, had center XY (34, 6), radius 6 mm and a Z axis. The original four wall IDs, width and height constraints and fixed anchor survived. Save and fresh Open kept the native solid. A Studio sketch edit after Open changed the radius to 5 mm and rebuilt the same named wall at center (35, 5). Volume was 11946.349540849362 mm³. Strict B-rep and independent analytic volume checks passed within 1e-8. Seven desktop captures. Saved R6 SHA-256 `da05fdb7c8a2aca0f514fc42f3a3d2514f730bcf3bc4cd2368a7c0e8c2c0a062`.
- **PASS, D1692 desktop regression.** The shared corner route still previews, approves and reopens the 6 mm Chamfer with 11820 mm³ and seven planar faces.
- **PASS, local checks.** 56 focused model tests, Model and Studio type checks, Studio production build, scoped lint and diff check.
- **NOT_RUN.** Live AI provider, mobile, the held B06 PDF, Agent line–arc Round, the separate manual line–arc browser suite and multi-corner editing. First mechanical CAD remains 8/10. B06 remains 6/7. Overall CAD progress remains unmeasured.

The first local type check exposed a duplicate type alias and the first browser run used exact-volume tolerance against the rounded MCP response. The corrected checks retain the strict native tolerance. The editable fixture displays its existing redundant-constraint notice.

## Reproduction

Use Node 22.19.0, the workspace gate, installed desktop Chrome and Playwright, and an external evidence directory.

```sh
pnpm --dir packages/barocss-cad-model type-check
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test revision-pinned-edit tool-contract toolset corner sketch-reopen-side-ids
pnpm --dir apps/cad-studio build
D1693_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-chamfer-agent-browser.mjs "$OUT/round" round
D1692_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-chamfer-agent-browser.mjs "$OUT/chamfer"
git diff --check
```
