# D1424 — Delete and heal one through bore

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `6284e45dca29e12930884ddd2f78984fcb670351`.

A rectangular plate with one straight circular through bore can now fill the bore through **Delete face**. Pick the cylindrical wall and apply the preview. Studio records a new feature on the current solid. The original Hole stays in History.

The native operation requires the existing single-bore rectangular plate chart. Either of its two named cylindrical patches identifies the same hole. The operation removes both cylindrical patches and both cap inner loops. The exterior face, edge and vertex IDs and their geometry remain. The strict native check gates the result. The authored Studio recipe stores an individual face signature and keeps that name on rebuild. A stale signature refuses Open before the document is adopted. The grouped agent command uses the same operation and the D1422 revision check.

## Verification

- **PASS, native Kernel.** For the off-centre Ø6 bore through the 40 × 30 × 10 mm plate, either half gives volume 12000 mm³ and centroid (20, 15, 5) mm. The restored body has genus 0, 6 faces, 6 loops, 24 coedges, 12 edges and 8 vertices. The existing loops and supports outside the bore retain their native identities. A translated fractional plate with a cap offset also heals. The wrong patch signature, blind hole, countersink, notch, multiple bores, duplicate name and altered pcurve are refused.
- **PASS, desktop Studio.** Use the Faces filter to pick the bore wall and apply Delete face. The original Hole remains in the accepted document. The native volume changes from 11717.256661176889 to 12000 mm³, against `12000 - 90π` and `12000` with tolerance `1e-7` mm³. Undo, Redo, Save and fresh Open passed. After Open, the worker and strict native volume both read 12000 mm³. Maximum edge-to-surface gap was 0 mm. Open refused a file whose recipe expected radius 30 mm instead of 3 mm and retained the current document. No page errors, console errors or watched source changes were recorded.
- **PASS, affected checks.** 35 Kernel, 30 Model and 25 Studio tests, scoped lint, generated agent tool table, Kernel build, Model type-check and Studio production build. The separate desktop Offset face regression on the original bored plate also passed drag, collapse refusal, edit and fresh Open. Agent discovery and the system prompt measured 24,985 characters for 13 tools.
- **FAIL, intermediate.** The first Kernel test expected the generic reference category where the result emits `REFERENCE_MOVED`. The first Model discovery check measured 25,002 characters against the 25,000 cap. Shortening the hint preserved argument discovery and passed. The first browser attempt picked the circular rim under Pick all. Switching to Faces selected the wall.
- **NOT_RUN.** Full local suites, mobile, WebGL2, STEP exchange and the remaining broad Delete and Replace face acceptance. This result covers one closed straight circular bore.

Use Node 22.19.0. Run heavy tasks in order under the shared gate. Freeze the worktree during desktop flows and store receipts outside it.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{bored-face-delete,bored-cap-offset,drafted-cap-offset,prism-wall-offset}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs delete-bore-face offset-bored-cap offset-to-plane revision-pinned-command toolset tool-contract fields
node apps/cad-studio/scripts/test.mjs document-file command-apply toolset-mcp tool-contract-mcp
node apps/library-docs/scripts/agent-tools.mjs --check
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
cd apps/cad-studio
DELETE_BORE_FACE_FROZEN=1 node test/delete-bore-face-browser.mjs "$STUDIO_OUT"
BORE_CAP_OFFSET_FROZEN=1 node test/offset-bored-cap-browser.mjs "$OFFSET_OUT"
```
