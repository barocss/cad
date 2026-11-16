# Hole History depth point-contact guidance (#22)

## Accepted scope

The original modeling checklist rows 2019–2026 describe a curved imported lid: depth 12.8 leaves two closed pieces, 13 is refused at a point contact, and 14 recovers. This change only explains the **13 mm History refusal**. It does not add the separate successful-result pieces advisory, change native admission, recommend a depth, infer through-hole intent, or change geometry/tolerances.

`holeDepthContactFailure` requires the same uniquely identified Hole in accepted/candidate nodes, unchanged other nodes, only finite explicit Depth changed, exact matching failed feature, `GEOMETRY`, and the anchored native point-contact sentence with three finite numeric coordinates. Generic errors remain untouched. The original code/detail/feature/failed-feature attribution is preserved. The History integration runs only inside the existing owned asynchronous failure path and matching revision. Nonmatching failures retain their existing presentation. Existing Reset focus behavior is unchanged; there is no new automatic field focus.

## Original source identity

Recovered complete `doc` from:
`/tmp/barocss-sketch-dimensions.A2LhgMMS/results/desktop-d9fb7dd0f-hole-depth-breakthrough-ux/10-undo-depth-8.json`

SHA256: `325a60ac3aae0870a9d95d23c2f55a26a7d33c626e2a3b14902df1aa93c6b4d4`.

The driver embeds that unchanged schema-3 document, including the STEP bytes. Hole `n1` targets `{node:0,side:'solid'}`, radius2, center[45,5], side min, saved face `n0.n0.surface1`, depth8. No fixture geometry was reconstructed or approximated. Historical receipt/PNG files were unavailable; the JSON source and native stdout evidence were present.

## Actual Chrome/native evidence

- Baseline `/tmp/cad-hole-contact-before`: PASS(reproduced), before product change. Depth8→12.8 accepted, 13 refused with generic “The bodies only touch along an edge or a point” / overlap-bodies hint. Accepted12.8 preserved. Reset→12.8, explicit14 recovery, Undo/Redo and reopen passed.
- Fixed `/tmp/cad-hole-contact-after`: PASS, same actual flow. “Hole depth creates a point contact” and “The result touches itself at (45, 5, 13) mm. Change Depth or select Reset to restore the accepted Hole.” visible without opening Kernel detail. Failed Hole attribution remains visible. Screenshot `02-depth13-refused.png` inspected directly.
- Passive Worker observation forwards replies unchanged. Actual native error: code `GEOMETRY`, feature `n1`, detail exactly:

```text
B-rep: analytic Boolean: the result's boundary touches itself at (45, 5, 13), where one surface only touches another: not a manifold solid (the inputs touch along an edge or at a vertex)
```

- Independently compared baseline/fixed `01-depth12-8.json`, `03-depth14.json`, `04-reopened.json`: **doc and bodies exact equality in all six comparisons**. The advisory does not change the accepted geometry/document.
- Both receipts: errors, consoleErrors, downloads and source changes empty. Context/browser/server cleanup completed, exit0.
- Initial launcher omitted the freeze environment variable and stopped at the harness admission assertion before browser startup. Corrected invocation above produced the baseline PASS; no product failure hidden.

## Verification

- Focused `hole-depth-contact-feedback` + adjacent native `split-dependent-hole-feedback`: **4/4 PASS**.
- Studio `tsc --noEmit`: PASS.
- Scoped ESLint product/helper/test/driver: PASS; driver syntax and `git diff --check`: PASS.
- Production build: PASS in 3.88s at integration. Independent read review found no blocker; root also reviewed the final refusal screenshot and receipt.
- Unit refusal coverage: wrong code/feature/index, nonmatching or malformed/nonfinite contact text, parameter/nonfinite/unchanged Depth, additional geometry edits, other-node changes, duplicate IDs. No source mutation.

Run from `apps/cad-studio` under the repository heavy gate with Node22/Chrome and all checkout writers frozen:

```sh
HOLE_DEPTH_CONTACT_FROZEN=1 node test/hole-depth-contact-browser.mjs /tmp/cad-hole-contact-before --baseline
HOLE_DEPTH_CONTACT_FROZEN=1 node test/hole-depth-contact-browser.mjs /tmp/cad-hole-contact-after
node scripts/test.mjs hole-depth-contact-feedback split-dependent-hole-feedback
```

Baseline requires the pre-change product source. This is one historical imported STEP case, not a general curved-cut capability claim. The successful12.8 disconnected-piece notice remains a separate open scope. No manufacturing/kernel/HOLD work or protected WIP files changed.
