# D1566 — Author an external-axis triangular Smooth Screw from one sketch

P5, row 07, [#630](https://github.com/barocss/cad/issues/630). Base `fcb7d7ee5741fee7af09272157e2147f433701ad`.

## Decision

Allow one standalone straight triangle in Smooth Screw. Reuse the signed angle, pitch, plane and section copy path. Translate the source corners into the requested axis frame before validating clearance. Use the same internal clearance predicate for the command, native fit and recognition of saved section copies. The predicate checks the represented triangle and the distance to its three closed edges, including the closest vertex. Use the longest edge for the native tolerance. Keep the existing terminal winding motion check with the triangle centroid and use the standard pitch and winding fields.

## Evidence

- **FAIL, previous desktop Studio.** Pick the tilted straight triangular sketch and search for Smooth Screw. Studio keeps the command inactive and explains the rectangular prerequisite. The tilted rectangle control opens a valid preview. Baseline driver SHA-256 `8bd491810255570461eddc282d51481356d84937d2b8d06302f9aa896b23a26a`.
- **PASS, actual Studio authoring.** The same triangular sketch refuses the interior axis `(7, -5)` with Apply disabled and the document unchanged. Axis `(10, -3)` is inside the bounding rectangle and outside the triangle. With 40 mm pitch, +360° and −360° both preview and Apply. Both produce one strict closed solid with five faces, nine edges, 18 coedges and three shared cubic rails. The maximum authored station residual is `1.422e-14 mm` across the two initial bodies. Both native volumes agree with the independent `840.1080446694306 mm³` reference within `1e-7 mm³`.
- **PASS, actual Studio lifecycle.** Save −360° and fresh Open it. The document and native digest match exactly. Edit the signed turn to +360° and recover the independently authored positive document and solid. Change pitch to 48 mm and verify 48 mm advance and `1008.1296536033176 mm³`. The saved negative project SHA-256 is `e48f06f3350a4096b7da627717a54ba68dd288590f3c1a5684e4d0075821ec45`.
- **PASS, Model coverage.** Verify ±360° and ±450°, both source orientations, retained IDs, native round trip, exact closest-vertex clearance, boundary and interior refusal, and revision-pinned Agent dispatch equal to the command. The Agent change exposes the existing command's new input profile.
- **PASS, affected gates.** 41 Model and 17 Studio tests, Model types, kernel library build, built internal export, scoped ESLint, generated Agent inventory, Studio production build, browser syntax and Git diff. The existing rectangular ±180° Smooth Loft control accepts both signs and reopens the saved negative body in actual Studio.
- **FAIL, initial browser assertion.** The expected refusal appeared with the command error prefix. The first exact-text lookup timed out. Checking the scoped error text passes in the completed run.
- **Open display finding.** The live blue command preview shows coarse walls. The applied and reopened Model body uses the compact display from D1565. Compare those two display paths before qualifying the live preview's visual accuracy.
- **NOT_RUN.** Live Agent review and Studio approval for triangular Screw, visually accurate command preview, triangular STEP exchange, arbitrary profiles, mobile and full local suites. #630 remains open.

Use Node 22.19.0 and the installed desktop Chrome and Playwright. Gate each heavy operation. Keep model files, screenshots and logs outside Git.

```sh
SCREW_LOFT_FROZEN=1 node apps/cad-studio/test/external-axis-screw-loft-browser.mjs "$EVIDENCE/studio" --single-sketch
SCREW_LOFT_FROZEN=1 node apps/cad-studio/test/external-axis-screw-loft-browser.mjs "$EVIDENCE/rectangle-loft-control"
pnpm --dir packages/barocss-cad-model test smooth-triangular-turn smooth-screw-command smooth-turn-angle toolset tool-contract
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir packages/barocss-cad build:library
pnpm exec eslint packages/barocss-cad/src/{internal/triangular-screw-axis,features/loft-rectangular-turn}.ts packages/barocss-cad-model/src/{app/ruledTurnCommand,app/smoothLoftTurn,chat/part/features}.ts packages/barocss-cad-model/test/smooth-triangular-turn.test.ts apps/cad-studio/test/external-axis-screw-loft-browser.mjs
pnpm --dir apps/cad-studio test tool-contract-mcp toolset-mcp history-feature-apply palette-rank
node apps/library-docs/scripts/agent-tools.mjs --check
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/external-axis-screw-loft-browser.mjs
git diff --check
```
