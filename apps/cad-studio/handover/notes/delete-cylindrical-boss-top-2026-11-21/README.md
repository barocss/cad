# D1459 — Heal the original plate by deleting a cylindrical boss top

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `750f68065335558d3ddcc02aa3d1d099247a3153`.

**Delete face** accepts the original planar top of one fully enclosed upright cylindrical boss on rectangular stock. The kernel proves the two outer cylinder halves, upper and lower rim bindings, two axial seams and the closed rectangular remainder. It removes the boss and the inner trim on the stock cap. The original cap chart and all six surviving faces stay. Studio and MCP store the individual planar signature and keep the Union in History.

## Verification

- **FAIL, baseline.** Actual desktop Studio selected `n3.top` but marked Delete face unavailable. Stdio MCP at revision `e500d72b9b50e64e` refused the same face and retained the source bytes and 12169.646 mm³ body.
- **PASS, native kernel.** A 40 × 30 × 10 mm plate and a Ø6 boss standing 6 mm above it give `12000 + 54π` mm³. Delete face restores 12000 mm³ and centroid `[20, 15, 5]` mm. The strict genus-0 result has six faces, six loops, 24 coedges, 12 edges and eight vertices. The surviving faces and incidence keep their exact IDs, charts and trims. A second Ø4 witness also passes. Plain caps, cylindrical wall picks, a through bore and a boss cut by the outer boundary refuse.
- **PASS, actual desktop Studio and stdio MCP.** The stock plane is refused. The exact boss top accepts and creates one Delete face feature. Undo restores the boss. Redo, Save, fresh Open and Open of the matching MCP file restore the original stock geometry. A saved planar signature with the opposite normal refuses and keeps the current model. The existing bore and inside fillet flows pass. All three final receipts record zero page errors, console errors and watched source changes.
- **PASS, affected checks.** 128 Kernel, 63 Model and 42 Studio tests. Kernel and Studio builds, affected lint, Model type-check and generated agent tool table.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile, STEP, angled bosses and mixed or multiple protrusions. #17 stays open.

Use Node 22.19.0 and the existing Chrome and Playwright. Create a 40 × 30 mm rectangle and extrude it by 10 mm. Extrude a 3 mm radius circle at (11, 9) mm from Z=8 mm to Z=16 mm, then unite the two solids. Save the source as `boss.bcad`. Run heavy commands under the shared gate. Freeze worktree writes during desktop verification and keep evidence outside Git.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{boss-face-delete,box-wall-replacement,drafted-cap-offset,prism-wall-offset,bored-cap-offset,bored-face-delete,d148-hole-face,analytic-l-fillet-heal}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs offset-bored-cap offset-to-plane delete-boss-face delete-bore-face delete-fillet-face replace-face revision-pinned-command toolset tool-contract fields spec
node apps/cad-studio/scripts/test.mjs document-file command-apply failed-feature offset-hex-side-feedback task-run-handoff toolset-mcp tool-contract-mcp
pnpm exec eslint packages/barocss-cad/src/{features/bored-cap-offset,part/part-model}.ts packages/barocss-cad-model/src/{engine/doc,app/deleteFaceCommand,chat/part/features}.ts
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node apps/library-docs/scripts/agent-tools.mjs --check
cd apps/cad-studio
DELETE_BOSS_CAP_FROZEN=1 node test/delete-boss-face-browser.mjs "$EVIDENCE/studio-boss" "$EVIDENCE/boss.bcad"
DELETE_BORE_FACE_FROZEN=1 node test/delete-bore-face-browser.mjs "$EVIDENCE/studio-bore-control"
DELETE_FILLET_FACE_FROZEN=1 node test/delete-fillet-face-browser.mjs "$EVIDENCE/studio-fillet-control"
```
