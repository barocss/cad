# D1782 — Sweep two rectangular passages from a straight span into an arc

P5 advanced geometry, rows 07 and 30. [Issue #10](https://github.com/barocss/cad/issues/10). Base `e247b5818ae550d0a88d1972b4420aee736b9b9d`.

Sweep a bend-aligned rectangle with two radially centered, axially separated rectangular openings on a straight span followed by a tangent circular arc. Match each authored aperture loop across the native prism and bend. Bind both sides of each seam and both charts at the bend outlet. Preserve loop ownership, names and History references during supported aperture edits. The Agent command description lists this range and the required wall clearance.

- **PASS, original desktop Studio refusal.** The original Exact Sweep refuses the two openings, disables Apply, and preserves the source Sketch and Direct rail.
- **PASS, native geometry.** One closed genus-two shell, 26 faces, 30 loops, 60 edges and 36 vertices. Each cap has two separate openings with four edges each. The 12 straight-to-arc joins measure 0° and retain both charts. Sampled curvature difference is zero on plane pairs and the reciprocal bend radius on cylinder-to-plane pairs. The 30° and 120° oblique fixtures retain both aperture windings. Refusal covers radial offset, insufficient cover or web, axis contact, roll, third aperture and unsupported rails.
- **PASS, desktop Studio WebGPU.** On a 10 mm lead and R20 quarter arc, both cap views show two open sight lines and the intervening material. Studio measures all 12 joins. Radial offset and touching edits refuse with the saved document intact. Changing one aperture from 2 × 2 mm to 2 × 1 mm preserves the other aperture and all 12 seam IDs. Undo, Redo, Save, fresh Open and a second edit pass. The final flow passed 14 checkpoints, with zero source changes, page errors or console errors.
- **PASS, independent mass and local Agent.** Section area × path length gives 1,325.3096491487338 mm³ before the edit and 1,408.1415022205297 mm³ after it. Native volumes are 1,325.3096491487336 and 1,408.1415022205294 mm³. Native quadrature and independent centroid checks agree within 1e−7. Maximum chart gap is 1.066e−14 mm. Fresh Open keeps edited body SHA-256 `c02636ef3b1a8aad172d6ef63583da03d4786509526b967e9a5a607ca6349266`. Restoring the height and explicitly approving the staged local Agent proposal each recover `115ae7defd86e6abe20056087f6e28ec8448c5819562df53fbf8a3664f5b61d9`. Agent dry run and Studio Preview preserve the existing part.
- **PASS, legacy desktop controls.** The D1746 single-opening straight-to-arc duct and D1770 closed two-cavity ring pass 14 and 12 actual Studio checkpoints. Both match all five original native digest and volume observations, including the edited, reopened, restored and Agent-approved parts.
- **PASS, affected checks.** 202 kernel Sweep, 32 Model, and 21 Studio tests. Kernel library TypeScript build, Model type check, Studio build, scoped ESLint and Git diff check.
- **FAIL, recovered development checks.** The first new kernel tests required charts on the existing bend side-to-side longitudinal edges and omitted two curve API options. The tests now require the new seam and cap charts, sample every chart supplied, and use explicit options. The first candidate Studio test assumed a reversed axial sign for its sketch frame. The corrected oracle and the full Studio flow pass. The first single-opening control exposed an outdated Agent guidance assertion. Explicit single-opening guidance and an updated path assertion restored the control.
- **NOT_RUN.** Full local suites, aggregate code-shape, paired-opening Agent image review, new exchange, radial sketch Y for the paired case, alternate viewport backends, mobile and live providers. The desktop viewport still tessellates curved outlines. First mechanical CAD stays at 8/10 accepted. Overall progress remains unmeasured. Issue #10 stays open.

## Reproduction

Use Node 22.19.0, acquire the heavy gate, and set `CHROME` and `PW_DIR` to the installed desktop Chrome and Playwright. Write evidence outside the worktree. For the original refusal, use the base kernel with the paired Studio driver and pass `--expect-refused`.

```sh
pnpm --dir packages/barocss-cad build:library
node --test --test-concurrency=1 packages/barocss-cad/test/*sweep*.test.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test sweep-history-edit sweep-agent-remap rectangular-duct-proposal-review toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sweep-path-geometry sweep-path-feedback command-build-failure proposal-review-availability
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
D1782_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/paired"
D1746_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs "$OUT/control-single" --line-and-arc
D1770_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-closed-paired-cavity-sweep-browser.mjs "$OUT/control-closed"
git diff --check
```
