# D1937 — Share a Constant Fillet grip across both complete cylinder rims

P1 [row 7](../../roadmap-rows/07.md) and [row 20](../../roadmap-rows/20.md), [#214](https://github.com/barocss/cad/issues/214). Base `cf6e3900c567c19150dcd4d617b305afb0f3423a`. Feature change.

One Constant Fillet grip controls the two full rims of an original upright cylinder. Each displayed rim owns its two original native half-edge names. Either pick order uses the positive-X seam of the upper rim. In History the current original-body reply must authenticate all four saved signatures. The accepted-body proof verifies each half torus, its reciprocal seams, its original cap and its own cylindrical wall by native ID. It binds the upper display face by native membership, because both rounds have the name `n2.face`. The shared drag stays inside a positive cylindrical wall span and cap radius. Existing typed geometry admission remains available.

- **FAIL, previous desktop Studio.** Creation selected the lower and upper rims. The grip missed the upper seam by 19.356252 CSS px in Top and 231.694609 px in Iso. The saved History grip missed by 284.642767 px in Top. Typed R0.6 and R1.5 produced valid solids.
- **PASS, actual desktop Studio.** Both creation and saved History align within 0.00006 CSS px of the independent upper seam. End-on dragging changes both rims from R0.6 to R1.5. Creation and History verify native equality with typed R1.5, Undo/Redo, Save and fresh Open. History Cancel keeps the original document. A held genuine original-body reply cannot start a drag after release of a pending press. The same delayed source reply cannot affect a replacement document. The existing single lower-rim History also passes.
- **PASS, independent native geometry.** An R8 × H10 cylinder at R0.6 and R1.5 retains four original half-edge names and four torus patches on two distinct caps, with 8 faces, 8 loops, 28 coedges, 14 edges, 8 vertices and genus 0. The half-chart trim proof uses exact rational boundary coefficients and reciprocal native incidence. All 28 stored pcurves are null. Strict validation checks the native boundary reconstruction. The independent volume is πR²H − π[(4 − π)(R − r)r² + 2r³/3]. The native volumes are 2002.9827237632085 and 1964.1105089578734 mm³. The centroid is (0, 0, 5) mm. Volume error is below 6e−11 mm³. R5 is a separate existing typed result with six faces and no retained central cylinder, and the new proof does not issue a shared grip for it.
- **PASS, affected checks.** 59 Model tests, 30 Studio tests, Model and Studio types, scoped ESLint, Studio production build and diff check. The tests cover pick order, a damaged native seam, stale or swapped surface ownership, missing lower source and proof removal after placement.
- **FAIL, command wrapper only.** The first combined shell returned status 1 after both browser runs completed because a shell variable name was reserved. Both separate receipts report PASS with clean source and browser logs.
- **NOT_RUN.** General curved edges, unsupported stock and additional rim groups, full local suites and mobile. #214 remains open. First mechanical CAD remains 8/10 accepted. Whole CAD remains unmeasured.

```sh
D1937_SOURCE_FROZEN=1 node apps/cad-studio/test/closed-circular-fillet-handle-browser.mjs "$OUT/creation" --two-rims
D1937_SOURCE_FROZEN=1 node apps/cad-studio/test/closed-circular-fillet-handle-browser.mjs "$OUT/history" --two-rims --history
D1878_SOURCE_FROZEN=1 node apps/cad-studio/test/closed-circular-fillet-handle-browser.mjs "$OUT/lower-control" --lower --history
node packages/barocss-cad-model/scripts/test.mjs circular-fillet-handle native-fillet-torus-pair api-variable-fillet references
node apps/cad-studio/scripts/test.mjs history-fillet-radius-receipt scalar-handle-drag
pnpm --filter @barocss/cad-model type-check
pnpm build
git diff --check
```

The previous-source desktop runs use `--two-rims --baseline` and `--two-rims --history-baseline`. Use the installed desktop Chrome and Playwright. Test scenes and raw receipts stay outside Git.
