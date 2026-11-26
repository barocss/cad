# D2029 — Repeat an earlier through-bore past later circular and rectangular cuts

P1, [#25](https://github.com/barocss/cad/issues/25). Follows [D1993](../prior-circular-cut-chain-2026-11-25/README.md).

Previously the original circular source certificate required all newer through-cuts to be rectangular. The desktop baseline reproduced the refusal for a plate with an original R2 circular cut, one later rectangular cut, and a separate later R3 circular cut.

For Linear only, accept later original circular extrusions as well. Certify that the initial and each later opening is a complete, strictly interior and disjoint through-cut. Preserve the accumulated opening geometry and tags at each subtraction. Every proposed R2 occurrence is checked against the original R2, each later opening and every other proposed occurrence before any repeated subtraction. Other pattern families and partial, drafted, transformed, overlapping or arbitrary-shape cutters retain their existing restrictions.

## Evidence

- **Actual desktop Chrome/WebGPU:** [tangency to the later R3 bore at 29 mm is refused](studio/01-tangency-refused.png), as is overlap at 32 mm. No Document or History change on refusal. Initial application at +8 mm makes an R2 copy at X18. Editing History spacing to +24 mm moves only that copy to X34. Undo/Redo, .bcad Save and [fresh Open](studio/02-fresh-open.png) restore the actual native shape and source.
- **Geometric proof:** One strict-valid shell with four through-openings. Both caps keep the original R2 at X10, R3 at X44, the original rectangle and the copied R2. Named circular walls keep their geometry and direction. Analytic volume is 24,000 − 80 − 170π = 23,385.9292488897 mm³. Independent first moments agree with the measured centroid.
- **Regression controls:** 34 kernel checks pass, including negative spacing, round-cut overlap/tangency, later blind cut refusal, unchanged Rectangular/Fill/Path scope and native save/reopen. The prior two-rectangle Desktop scenario also passes independently. This is a verified increment, not closure of #25 or validation of arbitrary topology repair.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{prior-circular-*,prior-path-cut-pattern}.test.mjs
D1993_SOURCE_FROZEN=1 PW_DIR=/path/to/playwright CHROME=/path/to/chrome \
  node apps/cad-studio/test/prior-circular-cut-chain-browser.mjs /tmp/cad-mixed-proof --mixed
```
