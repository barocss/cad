# #20 · Explicit held-edge replacement preserves parameter-bound Fillet radii

Parent: `ae4af80a6fed20b0b55078fe9cf9f0491b4e49b3`. **Bounded feature and actual verification complete; #20 remains OPEN.** No Model/native geometry algorithm, schema, automatic topology inference, manufacturing HOLD or protected WIP changes.

## Product contract

A terminal held varying Fillet can offer explicit **Replace edge** when its existing radius fields are numbers or exact `Dim` parameter references resolving to own, finite, positive current parameter values. Missing, inherited, malformed, zero, negative or nonfinite references remain refused. Existing circular law, terminal feature, unique original unmerged native straight edge and valid endpoint/interior-fraction restrictions remain.

The chosen edge assigns its displayed first endpoint to Start and its second to End. Only authored control-point `at` coordinates are relocated; parameter references, fractions and unrelated fields are not flattened or rebound. Replacement still goes through the existing evaluated-success commit and ownership checks. No automatic nearest-edge choice is added.

Review text now shows both the binding and its current value, e.g. `Start RStartR (1)` and `End REndR (3)`, rather than `[object Object]`. Unavailable values are named as unavailable. Existing numeric display is retained.

Product/test files:
- `src/state/heldFinishReplacement.ts`
- `src/state/useHeldFinishEdge.ts`
- `src/ui/NodeEditor.tsx`
- `test/held-finish-replacement.test.ts`

Actual driver/evidence files: `test/held-bound-fillet-replacement-browser.mjs` and this directory only.

## Before and after actual evidence

The synthetic fixture reuses the existing 30 × 12 × 20 box and missing-edge two-end circular Fillet from [numeric varying replacement](../held-variable-fillet-replacement-2026-11-16/README.md). Parameters are `StartR=1`, `EndR=3`; saved base/start/end radii are `Dim` objects, not literals. Raw input is [authored-fixture.bcad](authored-fixture.bcad); opening produces the explicitly [held accepted document](accepted-held.bcad). That normal held-reference admission is not treated as a source-edit failure.

### Baseline01: gap reproduced

`/tmp/cad-held-bound-fillet-before-01`, first run PASS as a reproduction: held/suppressed Fillet, all bound fields/parameters and original two nodes preserved, but History `Replace edge` button count is **0**. The [baseline screenshot](before01-bound-held.png) visibly shows held reference state and bound names. The editor's bottom is below the screenshot: button absence is a DOM assertion, not proof from a fully visible panel.

### After01: explicit replacement and functional binding

`/tmp/cad-held-bound-fillet-after-01`, first run PASS:

1. Explicitly select the original front-top straight edge. Candidate markers are Start `[0,0,20]`, End `[30,0,20]`; summary shows exact `StartR (1)` / `EndR (3)` and no object-string artifact. Staging changes no accepted Doc.
2. Cancel keeps the entire held Doc exact and removes endpoint markers. Retry explicitly, Apply, then verify the complete accepted Doc: only the intended edge/signature, control positions and held/suppressed/rematched removal differ. Feature ID, parent, outputs, parameters, original nodes and radius `Dim` structures remain unchanged.
3. Undo restores the exact held Doc; Redo restores the exact replacement.
4. Public Parameters changes **StartR 1 → 2**, with EndR fixed at 3. The complete Doc changes only `parameters.StartR`. Current body `b2` is fresh, has finite positive volume and no pending `massRef`. Reported volume decreases from **7172.101761241656 to 7159.225651045537 mm³**. This proves functional reevaluation rather than only saved binding syntax. It is an application current-body observation, **not** a new independent native accuracy certification. Undo/Redo reproduce the respective volume readings within `1e-7` and exact documents.
5. Public Save produces an actual browser download, then a fresh browser context opens that file. The independent standard-library Python reader verifies exact saved `StartR=2`, `EndR=3`, both endpoint `Dim` references/positions and original nodes. Fresh History visibly retains both bindings and current values 2 / 3.

[Actual downloaded file](bound-replaced.bcad): **1392 bytes**, SHA-256 `0f73efd4cfd306f2425f72f5e6dde1e9f754a23ab6269c74e1ce51e91b5e319c`.

- [After02: staged binding names/current values, explicit Apply](after02-bound-staged.png)
- [After07: fresh Open, StartR=2 / EndR=3](after07-fresh-bound-history.png)
- [Independent saved-file result](saved-oracle.json), [parser](independent-saved-parser.py), [input](saved-oracle-input.json)

Baseline and both after screenshots were directly inspected and independently reviewed. Text is readable within the stated framing limits; synthetic data, no personal information. Raw receipt `ROOT_MUST_VIEW_SCREENSHOTS` is historical runner metadata, not the final review status.

## Verification and execution history

- Focused helper tests **9/9 PASS**: three new cases plus six existing/updated cases. Numeric/mixed/bound laws, preserved object identity, reversed candidate endpoints, interior fractions, invalid bindings and resolved-value review strings are covered. These are helper tests, not actual interior-station/native executions.
- Initial Studio tsc failed **TS2345** in a test array's inferred optional property type. The test fixture typing was corrected. Final Studio tsc **PASS**.
- Final scoped eslint (four product/test files) **PASS**; final driver syntax and eslint **PASS**.
- Final production build **PASS, 4.84 s**, run before actual verification. No duplicate build/native suite was run.
- Baseline and after each froze **534 runtime capsule files** through cleanup, with no source changes/page errors/console errors. Baseline closed one context; after closed two. Chrome and Vite server closed in both; heavy lane and freeze released before evidence writing. No source/driver edits after final actual.
- There were no failed browser attempts in this task. Initial typecheck failure is retained separately from final success in [logs.txt](logs.txt), with original log hashes. [Curated receipt](receipt.json) records raw receipt/capsule hashes and exact artifact hashes.

## Limits

Actual coverage is **one terminal, original unmerged straight edge, two bound endpoint radii, circular law**. Interior bound radii/mixed laws/object identity are focused-test coverage only; actual JSON proves structural preservation, not JavaScript object identity. No new curved/multi-edge/closed-chain, nonterminal, shaped law, linked source, asynchronous cancellation or stale response qualification is claimed. Existing numeric/interior and cancellation evidence is historical, not rerun: [numeric varying](../held-variable-fillet-replacement-2026-11-16/README.md), [interior stations](../held-interior-fillet-replacement-2026-11-16/README.md).

No native B-rep accuracy suite or independent geometric mass computation was repeated. The Python oracle reads saved JSON and compares observed application values; it does not recompute the Fillet. Broad #20 reference recovery and #118 topology requirements remain separate, with existing HOLD/WIP preserved.

## Reproduce

From `apps/cad-studio`, using Node 22:

```sh
export PATH="$HOME/Library/pnpm/nodejs/22.19.0/bin:$PATH"
node scripts/test.mjs held-finish-replacement
../../node_modules/.bin/tsc --noEmit
../../node_modules/.bin/eslint src/state/heldFinishReplacement.ts src/state/useHeldFinishEdge.ts src/ui/NodeEditor.tsx test/held-finish-replacement.test.ts
node --check test/held-bound-fillet-replacement-browser.mjs
../../node_modules/.bin/eslint test/held-bound-fillet-replacement-browser.mjs
```

Actual run, only after coordinating source freeze with every writer:

```sh
G="$HOME/.claude/local-mods/barocss-lanes-guard/bin/gate.sh"
"$G" acquire heavy 120 cad-held-bound-fillet-after || exit $?
trap '"$G" release heavy cad-held-bound-fillet-after' EXIT
PW_DIR="$HOME/.cache/barocss-playwright" \
CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
HELD_BOUND_FILLET_FROZEN=1 \
node test/held-bound-fillet-replacement-browser.mjs /tmp/cad-held-bound-fillet-after-01 --after
```

Use a new output directory for future runs. `--baseline` records the missing action against the original parent, not current fixed source. Shared `createFlow` captures the source subset/full runtime capsule before/after/after-cleanup. Do not overwrite existing attempts.

From this note directory, without launching CAD:

```sh
python3 -I independent-saved-parser.py < saved-oracle-input.json
```
