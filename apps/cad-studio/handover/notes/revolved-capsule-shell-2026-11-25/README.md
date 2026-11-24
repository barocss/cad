# D1944 — Open the upper hemisphere of an exact revolved capsule Shell

P5 [row 7](../../roadmap-rows/07.md), [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md), [#13](https://github.com/barocss/cad/issues/13). Base `a7b6d8283c15ade13472b1e4e3c12566b525be56`. Full geometry change.

Uniform Shell accepts the complete upper hemisphere of one canonical full capsule Revolve. The eligible meridian has two exact equal-radius quarter arcs, an original right barrel, and a straight positive Y axis through the local origin. Studio's one display selection names both native charts. The kernel reuses Revolve to produce inward concentric walls and an annular rim at the original upper equator. The lower hemisphere and barrel keep their original native face names and fully retained edge names. New native IDs belong to the Shell feature. The saved Shell node and its original opening reference use the existing file format.

- **FAIL, previous source.** Native and actual Studio refuse one curved opening with `only straight walls can be left open (side2)`. The accepted stock stays at 16755.16081914556 mm³. One click chooses the complete display hemisphere. The first browser attempt tried to select two separate display faces and toggled the same group. The accepted baseline records the existing single-face semantics.
- **PASS, strict native wall.** For radius R=10 mm, barrel length H=40 mm and inner radius r=R−t, the independently computed volume is πH(R²−r²)+(2π/3)(R³−r³). It gives 2955.191489476799 mm³ at t=1 and 5545.958231137181 mm³ at t=2. Closed-form and native B-rep mass agree within 1e−7 mm³. The first moment along the axis is πH²(R²−r²)/2−π(R⁴−r⁴)/4. The exact support balance, retained control points, edge names and strict 10-face, 10-loop, 36-coedge, 18-edge, 10-vertex genus-zero solid pass. The existing Revolve construction has no stored pcurves on this solid.
- **PASS, actual desktop Studio.** One click opens the upper end. Wall changes from 1 to 2 mm. A 10 mm wall is refused without changing the accepted part. Undo, Redo, Save and fresh Open preserve the expected geometry. The inspector checks trimmed native rim curves, original lower hemisphere and barrel supports, inward cavity normals and the outward rim normal at y=40 mm.
- **PASS, affected checks.** 54 Kernel tests including previous Revolve and Shell controls. Five Model and 31 Studio tests, library and Studio production builds, Model and Studio types, scoped ESLint and diff check. The native test verifies refusal of a single numbered chart or a wall that reaches the axis.
- **FAIL, corrected verification.** The first current browser oracle tested UV samples of the rim support plane as if they were restricted to its trim. The final oracle checks the actual four bounding native curves of each rim chart and the orientation of the support.
- **NOT_RUN.** A lower-end opening, differently placed meridians outside the exact admission, freeform offset, multiple openings, new STEP qualification, full local suites and mobile. The #13 parent stays open for other profiles. First mechanical CAD remains 8/10. Overall CAD remains unmeasured.

```sh
CAPSULE_SHELL_SOURCE_FROZEN=1 node apps/cad-studio/test/capsule-shell-browser.mjs "$OUT/studio"
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{capsule-shell,part-model,r11-s0}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs shell-opening-history shell-walls
node apps/cad-studio/scripts/test.mjs shell-opening-history
pnpm --filter @barocss/cad-model type-check
pnpm build
git diff --check
```

The pinned old source uses the same browser with `--baseline`. Native measurements, source-freeze receipts and actual Studio scenes stay outside Git.
