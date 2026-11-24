# D1979 — Add the CAD React Hole component

P4 [row 4](../../roadmap-rows/04.md) and [row 5](../../roadmap-rows/05.md). Base `03494657cea84e5324230562bff07519c16b0fed`.

Export Hole and HoleProps as the twentieth CAD React component. Lower one child solid or a solid reference to the existing native Hole node. Preserve omitted fields, mounted feature identity and the existing Model host and Viewer. Document the component in its own sidebar entry.

- **PASS, actual desktop React and Viewer.** A production Vite fixture runs the existing Studio Worker and Viewer facade. On a 60 × 40 × 20 mm plate, the R4 blind Hole depth changes from 6 to 10 mm and back. The native body and Viewer frame share the current evaluation owner on every update. The mesh changes and Reset restores the original document bytes and mesh. At the default camera the hole floor is hidden and depth alone gives the same pixels. Increasing the radius from 4 to 7 mm changes the frame pixels. Reset restores the original pixels.
- **PASS, actual desktop Studio.** Open the exact depth-10 document returned by React. Use History to edit the Hole to 8 mm. Save, close the browser context and open the saved document in a fresh context. Body key `b2` and the Hole identity persist. The input remains byte-identical. The saved document SHA-256 is `b12fba4d9666c50dac0908f3d5aa07d47566ec5cbde787282da215c13c8d2d47`.
- **PASS, independent physical oracle.** Eight checks compare volume and centroid to a rectangular plate minus a coaxial cylinder. R4 at depths 6, 10 and 8 mm gives 47,698.4071052554, 47,497.3451754256 and 47,597.8761403405 mm³. R7 at depth 6 mm gives 47,076.3717598446 mm³. The React observations also verify the original full bounds. The retained Profile props roundtrip passes in desktop Chrome.
- **PASS, affected checks.** 113 package tests, package and public API types, scoped lint, seven sidebar tests and diff check.
- **FAIL, first harness run.** The Studio body observation omits bounds. Check bounds in the React host observation and check volume and centroid in both consumers. The final two browser receipts have no console errors or frozen-file changes.
- **NOT_RUN.** Through and alternate-axis Hole in desktop Chrome, mobile and whole-CAD acceptance. The private workspace API adds no package publication. First mechanical CAD remains 8/10.

```sh
CAD_REACT_HOLE_SOURCE_FROZEN=1 node packages/barocss-cad-react/tests/observation-current-browser.mjs "$OUT/hole" --hole-roundtrip
D775_SOURCE_FROZEN=1 node packages/barocss-cad-react/tests/observation-current-browser.mjs "$OUT/profile" --props-roundtrip
pnpm --dir packages/barocss-cad-react test
pnpm --dir packages/barocss-cad-react test:types
pnpm --dir packages/barocss-cad-react type-check
pnpm --dir packages/barocss-cad-react lint
node --test apps/library-docs/scripts/sidebar-scopes.test.mjs
git diff --check
```
