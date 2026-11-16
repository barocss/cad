# Explicit interior Fillet reference recovery (#20)

Extends the previous terminal-held, unique exact straight-edge replacement to one or two numeric interior controls. First/last must be atEnd without a fraction; internal controls have no atEnd, positive numeric radii and strictly increasing finite fractions inside (1e-9,1−1e-9) with gap>1e-9. Saved fractions/radii/ID remain unchanged. Only at coordinates are assigned on the explicitly chosen new a→b direction. No percent roundtrip, nearest-point inference, curved/chained/merged edge or shaped/parameter law expansion.

The candidate reuses withFilletStations for identical preview and committed coordinates. History lists each interior fraction, radius and location; the viewport shows those same locations. Existing full evaluation, identity checks and request retirement remain unchanged.

## Verification
- Helper tests6/6 PASS, covering one/two interior, reversed candidate, exact fraction preservation, malformed/ordered/boundary fractions and existing constant compatibility. Studio tsc and targeted lint PASS.
- Actual frozen browser `/tmp/cad-held-interior-fillet-02`: two controls25%/62.5%, radii1.25→3→1→2.5. Select/Cancel leaves the held document unchanged; explicit Apply assigns x0/10/25/40; Undo/Redo and native JSON reopen succeed. Width40→60 updates current displayed locations to0/15/37.5/60 without modifying authored fractions. Reviewed `01-two-station-assignment.png`.
- Independent native/Python oracle (existing exact Hermite polynomial coefficients, integrated with rational arithmetic): ∫r²dx at40 is27731/168. At40 expected11964.57664564985mm³, native/worker11964.576645649728; at60 expected17946.864968474772, native/worker17946.864968474518. All seven control/mid-span native sections match independent quarter-circle positions; max residual1.051e-12mm at40 and9.245e-13mm at60. Strict B-rep PASS. Volume alone is not used to infer radius direction.

## Reproduced residual boundary, not fixed
First run `/tmp/cad-held-interior-fillet-01` failed expecting the Width60 document to reopen without a new hold. The feature's saved signature remained p[20,0,10],length40 after the accepted History resize, while the current edge is p[30,0,10],length60. Generic History onApply in App.tsx evaluates and commits next without the refreshSignatures used by the separate parameter-edit path. Open then refuses matching the old signature; fractions/radii remain unchanged. This is not treated as successful persistent upstream-reference editing.

Final run explicitly records that known hold (`04-known-stale-signature-boundary`), then uses the new user-confirmed Replace edge at length60. The updated signature and coordinates reopen correctly (`06-reattached-reopened`), with independent native oracle. No automatic matching, clearing signatures or tolerance weakening was added to mask this boundary. #20 stays OPEN; a narrow proven signature refresh after accepted upstream edits is the next investigation, with topology changes still requiring explicit choices.

One-interior mapping is unit-tested, not separately browser-qualified here. Pending Cancel/New part retirement was verified by preceding ef21f067d and the unchanged hook was not replayed. Physical downloads/full suites/remote CI not claimed. WIP/HOLD preserved.

Run from Studio: `node scripts/test.mjs held-finish-replacement`; `HELD_INTERIOR_FROZEN=1 node test/held-interior-fillet-replacement-browser.mjs <output>`.

Final Studio production build PASS4.04s; existing warnings only.
