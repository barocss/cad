# D1786 — Sweep two passages through an elbow with two straight ends

P5 advanced modeling and kernel generality, rows 07 and 30. [Issue #10](https://github.com/barocss/cad/issues/10). Base `c4eb17cfd9414d2e095110e92a9129f6ff6251d3`.

Apply the paired rectangular section to an Exact Sweep with a tangent straight span at each end of one circular bend. The existing native join matches each aperture in both cross-sections. Both joins use the existing wall and web checks. The Agent command description covers the paired profile on this path.

- **PASS, original refusal reproduced.** Desktop Studio recognizes the exact line–arc–line path. The base asks for one centered rectangular opening, disables Apply and keeps the sketch and Direct rail intact.
- **PASS, native geometry.** One closed genus-two shell, 38 faces, 42 loops, 168 coedges, 84 edges and 48 vertices. Each terminal cap has two separate four-edge apertures. The 12 edges at each straight/bend junction retain both charts and measure 0°. Native cylinder-to-plane curvature difference agrees with the reciprocal radius. The 30° and 120° translated cases include an 80 mm terminal span and reversed aperture windings. Eccentric, touching, thin-wall and unsupported aperture inputs refuse and preserve the previous part.
- **PASS, desktop Studio WebGPU.** Sweep the 4 × 10 mm outer section with two 2 × 2 mm passages on a 10 mm lead, R20 quarter arc and 14 mm tail. Verify both open sight lines and the material web at each end. Measure all 24 joins. Offset and touching edits refuse. Shortening the first passage height to 1 mm preserves the other aperture, wall names and seam IDs. Undo, Redo, Save, fresh Open and restoring the height pass. A revision-bound local Agent dry run and explicit Studio approval match the manual native body.
- **PASS, independent mass.** Section area × (24 + 10π) gives 1,773.3096491487338 mm³ before the edit and 1,884.1415022205297 mm³ after it. Native volumes are 1,773.3096491487338 and 1,884.1415022205300 mm³. Native quadrature, the closed-form centroid and Studio body data agree within 1e−7. Maximum native chart gap is 1.066e−14 mm. Fresh Open preserves edited SHA-256 `c514f4498bb3c2b9e9fc9f8f8c20ae12aee2f8dfc7786277115c2de9b6776b24`. Restoring the height and explicitly approving the local Agent proposal recover `b990430305f526bfb3edb29ad905110fcac1c4bbc10a049eb897672dafde9d40`.
- **PASS, controls and affected checks.** The single-opening elbow retains four native digest and volume observations. The paired straight-to-arc control retains six native observations and both D1783 Agent PNGs. The four desktop runs cover 42 checkpoints with zero source, page or console errors. 207 kernel Sweep tests, 41 Model tests, 21 Studio tests, scoped ESLint, kernel library build, Model type check, Studio production build and Git diff check pass. Three baseline kernel shape hashes also match.
- **NOT_RUN.** Full local suites, aggregate code-shape, pending Agent image review for the extended path, wider profiles or frame laws, new exchange, alternate viewport backends, mobile and live providers. The desktop outline uses tessellation. First mechanical CAD remains 8/10 accepted. Overall completion remains unmeasured. Issue #10 stays open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and separate external output directories. Append `--expect-refused` to the paired elbow driver with the original kernel.

```sh
pnpm --dir packages/barocss-cad build:library
node --test --test-concurrency=1 packages/barocss-cad/test/*sweep*.test.mjs
D1786_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/paired-elbow" --straight-tail
D1675_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs "$OUT/single-elbow"
D1783_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/paired-lead" --review
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test sweep-history-edit sweep-agent-remap rectangular-duct-proposal-review paired-line-arc-duct-evidence toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sweep-path-geometry sweep-path-feedback command-build-failure proposal-review-availability
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
git diff --check
```
