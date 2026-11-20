# D1450 — Move the source plane after two tilted bore heals

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `c5ac309056cfb49eb91df67f295e0f4180072f00`.

This is a qualification of the existing feature sequence. Replace face tilts either cap of the D1443 plate. Two Delete face operations then fill its two bores. Moving the original donor by 2 mm away from the fixed cap updates the healed solid. The verified outcomes require no production code change.

## Verification

- **PASS, actual desktop Studio and stdio MCP.** The upper donor moves by +2 mm and the lower by −2 mm. The two exact plates grow from 15600 to 18000 mm³. The independent integral is 1200 mm² times the 15 mm mean thickness. Volume centroids are `(188/9, 16, 344/45)` and `(188/9, 16, 106/45)` mm. The donor remains a separate 192 mm³ solid. Both strict genus-0 plates retain six faces, six loops, 24 coedges, twelve edges, eight vertices, exact incidence, the original plane reference and both heal feature IDs.
- **PASS, persistence and refusal.** Studio Undo, Redo, Save and fresh Open pass. The exact MCP files open as the same native B-reps and six-face plate volumes. Both routes refuse the donor delta that makes one replacement corner touch the opposite cap. They keep the accepted 18000 mm³ geometry and file.
- **PASS, native identity.** Studio's History field edit keeps the two stored wall signatures. The MCP feature edit refreshes their positions and areas after the same named walls move. The stored names, radii, owner features and both native rebuild results agree in this case. The pinned MCP revisions are `679a940ff1ab7d48 → 0c89ca7144e49458` and `f40ff8b9f4f0eceb → 86662a191574ca03`.
- **FAIL, exploratory harness only.** The first script guessed the MCP field key `z`; this feature exposes `o2` for ΔZ. An intermediate assertion expected the old signature positions and areas in the MCP file. A browser assertion then required both routes to store those signature fields identically. The final check compares both actual signature contracts and requires identical rebuilt native geometry. The two canonical desktop receipts record zero page errors, console errors or source changes.
- **NOT_RUN.** Full local suites, repeat production build locally, actual WebGL2, mobile, STEP, larger valid moves and retargeting the donor to another face. #17 remains open.

Use Node 22.19.0 and the existing Chrome and Playwright. Run the desktop flow under the shared gate and keep evidence outside Git.

```sh
node --check apps/cad-studio/test/tilted-heal-donor-browser.mjs
git diff --check
for side in upper lower; do
  node apps/cad-studio/test/replace-face-mcp.mjs "$EVIDENCE/wire-two-bore-$side" "two-bore-$side"
done
cd apps/cad-studio
for side in upper lower; do
  order=first
  if [ "$side" = lower ]; then order=second; fi
  DELETE_TILTED_BORE_FROZEN=1 node test/delete-tilted-bore-face-browser.mjs "$EVIDENCE/heals-$side" \
    "$EVIDENCE/wire-two-bore-$side/mcp-replaced.bcad" "$side" "$order" successive
  TILTED_HEAL_DONOR_FROZEN=1 node test/tilted-heal-donor-browser.mjs "$EVIDENCE/studio-$side" \
    "$EVIDENCE/heals-$side/mcp-healed.bcad" "$side"
done
```
