# D1867 — Refuse unsupported STEP cone angle units

P0/P2 [row 13](../../roadmap-rows/13.md) and [row 16](../../roadmap-rows/16.md), [#277](https://github.com/barocss/cad/issues/277). Base `7bd914835667eab1bae141e3f6b19db9b36535c0`. FULL for the public STEP import admission boundary.

The reader now checks the representation contexts that directly own the current solid before using a cone semi-angle. This covers direct cones and the existing literal-zero Offset identity profile. An explicitly assigned unprefixed SI radian is accepted. The legacy default remains radians when the owning representation declares no angle unit. Degree and other explicit unsupported forms refuse before cone construction. A valid first owner cannot mask a conflicting owner. An unrelated shape's context and nonzero offset semantics retain their existing scope.

- **FAIL, unchanged product.** The equivalent 1° degree-declared source opened in Studio. Independent source slope is 0.0174550649282. The correct radian source produced a strict solid of 1865.283295695 mm³. The wrongly accepted direct and zero-offset cases produced 1865.096029059 mm³ and failed strict native geometry checks. The 30° direct source also opened with invalid native geometry. The 30° zero-offset case refused later on numerical range.
- **PASS, actual desktop Studio (six states).** Open the radian fixture, select the imported body and refuse the degree and exact-zero degree files with a plane-angle reason. Accepted model bytes, selection, camera, dirty state and history remain intact. Save and fresh Open preserve the accepted radian result. A non-cone holed block with the same explicit degree context opens. Release an actual refusal after New part and confirm the old notice does not appear.
- **PASS, independent geometry and affected checks.** The Part 21 oracle checks the linked solid, outer shell, face, support, active length/angle units and conversion factor for eight original variants. Native radian results match unitless imports exactly. The legacy exact-zero identity tests pass. 208 Kernel STEP/public part tests, seven Model tests, scoped lint, types and Studio production build pass. Sol High independently reviewed ownership and the two construction paths.
- **PASS, mutation control.** The unmodified candidate passes. Removing the direct guard, removing the zero-offset guard, choosing only the first active owner, and ignoring a radian prefix each fail the designated assertion. Repository source stays frozen during Studio.
- **FAIL, first affected checks.** The first part-level check required the existing CAPABILITY classification but used a message that mapped to INPUT. Refusal now uses the established unsupported-capability wording. The first fixed browser run found two buttons with the same label; the final driver selects the Browser row explicitly.
- **NOT_RUN.** Degree conversion, broader representation relationships, length-unit changes, dedicated explicit-degree planar-only and tessellated-only fixtures, external CAD import, the entire Kernel suite and mobile. The research issue remains open. First mechanical CAD stays 8/10.

## Reproduce the checks

Use Node 22.19.0 and the existing local desktop Chrome and Playwright. Run heavy stages serially.

```sh
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test packages/barocss-cad/test/step*.test.mjs packages/barocss-cad/test/api-part.test.mjs
pnpm --dir packages/barocss-cad-model test step-offset-units
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
D1867_SOURCE_FROZEN=1 node apps/cad-studio/test/step-cone-angle-browser.mjs "$OUT/studio"
```

Regenerate the eight independent readback inputs with the shared fixture and retain the four original hashes below. The Python reader imports only standard-library Part 21 helpers.

```sh
node --input-type=module - "$OUT" <<'NODE'
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { coneAngleFixture } from './packages/barocss-cad/test/step-cone-angle-fixtures.mjs';
for (const unit of ['radian', 'degree']) {
  for (const angle of [1, 30]) {
    for (const offset of [false, true]) {
      const name = `${unit}-${angle}-${offset ? 'offset' : 'direct'}.step`;
      writeFileSync(join(process.argv[2], name), coneAngleFixture(unit, angle, offset));
    }
  }
}
NODE
python3 -I apps/cad-studio/test/step-cone-angle-oracle.py "$OUT"
```

| Input | SHA-256 |
| --- | --- |
| Radian direct 1° | `3592fb384c8bc1eddb28a4aa8bd89a7492950844fb345184c00f266643a62f87` |
| Degree direct 1° | `94d2d67150b189d438155cd0ea433416dfcde6f214f87c9364a0bb09c523eaaf` |
| Radian zero-offset 1° | `dcfe0b7c527713e4fced9f71429b48d9de7f2798e79d3a2ae3461c43c6a40713` |
| Degree zero-offset 1° | `9068d485ec7e6b3e55079c1b351de510b81a7ce69775912757f2af9535cea162` |
