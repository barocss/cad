# D1288 — Sweep a circular disk along an exact circular arc

2026-11-15 · FEATURE with independent geometry checks · P5, rows 07 and 30

Studio Sweep offers **Exact circular arc** in Representation. Select one solid circular sketch and one visible Direct curve. The command copies the path. A History edit of the sketch diameter recomputes the solid. Existing Sweep recipes without a mode use their faceted representation. The exact mode creates a new body and refuses unsupported inputs without a faceted fallback. Linked Route Bundles retain their existing faceted recipe.

The Kernel accepts a single open, clamped rational quadratic arc from 30° to 90° with equal endpoint weights. It projects the supplied pole onto the chord bisector and verifies a bound on the locus change over the full span. The bound includes weight correction and the adjustment at an angle limit and must fit the native linear tolerance of 0.0000001 mm within the modeling range. Both path endpoints stay fixed. The profile radius must be below the path radius by more than the linear tolerance. The native solid has two rational toroidal patches and two planar caps. The selected path tangent places the profile at the start of the curve, and its sketch axes set the seam orientation.

The broader [exact Sweep issue](https://github.com/barocss/cad/issues/10) remains open. This decision qualifies the circular arc path for one disk.

## Verification

- **PASS — desktop Studio WebGPU.** The noncircular path previews in Faceted mode and refuses in Exact circular arc mode. Apply stays disabled and the accepted document is unchanged. Selecting the circular path retains exact mode and gives one visible solid. History rejects a 40 mm diameter at the 20 mm path radius. A 4 to 6 mm diameter edit updates the solid from 394.7841760435744 to 888.2643960980425 mm³, against `πr²Rθ`. The closed-form centroid matches the independent radial moment within 0.0000001 mm. Undo, Redo, toolbar Save, and Open in a fresh browser context preserve the copied path, exact mode, topology and edited volume. The original faceted Sweep History and file reopen flow also passes.
- **PASS — geometry and build.** Nine focused Kernel tests and 40 Model tests pass. The Kernel tests check oriented caps, paired edges, seam normals, a reversed path, the rounded oblique quarter arc, and a second mass measurement by generic B-rep quadrature. The Kernel, Model and Studio type checks, code shape, focused lint and Studio production build pass. The benchmark median was 1 ms over seven runs on this machine, with fingerprint `73b778a19685db4f`.
- **FAIL, corrected.** The first desktop run created the exact solid and failed at the edit step. The used sketch has no standalone History chip. The Sweep History editor now supplies its Diameter field. The final run verified both refusal and successful recompute through that field.
- **NOT_RUN.** Full local suites, all-angle closest-point sampling at the issue's 10,000-point target, WebGL2 and mobile, downstream Boolean or fillet, straight or general path authoring, and public Model API or agent authoring.

## Commands and evidence

Node 22.19.0. The heavy gate serialized local checks. Final browser runs reported zero page errors, console errors or source changes through cleanup.

| Desktop flow | Frozen source files | Receipt SHA-256 |
| --- | ---: | --- |
| Exact circular arc | 905 | `709239d4403b15893e97dc8a9798958a8bb07f1486d8d16a5c6b0edcb6ec3789` |
| Existing faceted Sweep | 903 | `f4add7b5059454ffc0634a552d545c3eb9be227415bd2390b21d010f2b516870` |

The edited native Save SHA-256 was `d593f4f2ccdbc7e8694e31555caf0eef49198f48a656d760f8fb09ebd1fba119`.

```sh
pnpm --filter @barocss/cad type-check
(cd packages/barocss-cad && node scripts/tool.mjs build:fast && node scripts/code-shape.mjs --check)
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-arc-sweep,sweep-solid,interpolated-hole-sweep-regression,route-bundle-sweep-foundation}.test.mjs
RUNS=7 node packages/barocss-cad/scripts/perf-bench.mjs run native-quarter-arc-sweep
pnpm --filter @barocss/cad-model type-check
TEST_CONCURRENCY=1 pnpm --filter @barocss/cad-model test route-bundle wire-doc
pnpm --filter @barocss/cad-studio-app build --outDir <external-build>
D1288_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-arc-sweep-browser.mjs <external-exact-evidence>
D1169_SOURCE_FROZEN=1 node apps/cad-studio/test/sweep-history-inputs-browser.mjs <external-faceted-evidence>
git diff --check
```
