# Hole History accepted-result pieces advisory (#22)

## Scope and ownership

The original checklist rows 2019–2026 reported no notice when Hole Depth12.8 left two disconnected closed pieces in the curved imported lid. This change adds a notice for an accepted **terminal base-part Hole History edit**, using the actual native result's integer `pieces > 1`, with no reported touching pairs. It does not claim the pieces are newly created, infer geometry from volume/mesh, automatically select/Separate, or change geometry, tolerances, selection or Undo semantics.

`holeResultPieces` requires a unique explicit Hole ID, no held/suppressed/placed-instance scope, one exposed canonical output key with exact `{node:editIndex,side:'solid'}`, and a unique matching result body/key/ref. Ambiguous/missing/downstream/touching results remain silent. The message says disconnected pieces, not a new topology/solid certification.

The controller limits **notice publication only** to matching reply revision, fresh/nonbusy current evaluated source, latest master (no marker or variant), and the existing live document/scope/worker/open/draft ownership. Existing commit admission is unchanged. The notice is published only if synchronous commit returns exactly true; its `documentSource.doc` is the actual postcommit `owner.document()` (commit may transform the candidate). App excludes in-place editing. Undo/New/Open invalidate that notice through existing document-source ownership. Rolled-back History's important removed-features notice is not overwritten.

## Reproducible original input

The driver embeds the complete unchanged doc from the original source:
`/tmp/barocss-sketch-dimensions.A2LhgMMS/results/desktop-d9fb7dd0f-hole-depth-breakthrough-ux/10-undo-depth-8.json`

SHA256: `325a60ac3aae0870a9d95d23c2f55a26a7d33c626e2a3b14902df1aa93c6b4d4`.

Full STEP bytes and Hole n1 targeting n0 solid, radius2, center[45,5], min side, face n0.n0.surface1, Depth8 are preserved. No geometry reconstruction.

## Actual acceptance

- `/tmp/cad-hole-pieces-before`: PASS(reproduced missing notice), source aa8f56add. Actual Depth8→12.8 accepted Worker result `key:b1`, `ref:{node:1,side:'solid'}`, `pieces:2`, no `lumpTouch`. No disconnected-pieces notice. Existing13 contact refusal and14 recovery/UndoRedo/reopen passed.
- `/tmp/cad-hole-pieces-after`: PASS. `01-pieces-advisory.png` directly inspected: visible notice without selecting the result, “The Hole result contains 2 disconnected pieces” and “Select the result body to inspect Pieces and use Separate if needed.”
- Immediate Undo removes notice; Redo does not resurrect it. Explicit repeated8→12.8 generates a current notice; New removes it. Existing13 refusal retains12.8; Reset/14 recovery/UndoRedo/reopen remain valid.
- Independent baseline/fixed comparisons of `01-depth12-8.json`, `03-depth14.json`, `04-reopened.json`: doc, bodies and selection **exact equality in all nine comparisons**.
- Passive Worker observer forwards all replies unchanged. It records native metadata only, does not inject outcomes/selection.
- Both receipts PASS, errors/consoleErrors/downloads/sourcechanges empty; context/browser/server closed and exit0.

## Validation

- Focused pieces/controller/contact tests: **22/22 PASS**.
- Studio tsc and scoped ESLint: PASS.
- Driver syntax, final driver lint and git diff check: PASS.
- Independent read review: no blocker.
- Production build: PASS in 3.90s at integration; root also directly reviewed the final advisory screenshot.
- Early test-file write used an incorrect relative path, so the initial adjacent-only run passed10 and ESLint reported missing test. Corrected path produced the complete22-test PASS; no product failure hidden.

Run under Node22/Chrome and the repository heavy gate with all source writers frozen:

```sh
HOLE_RESULT_PIECES_FROZEN=1 node test/hole-result-pieces-browser.mjs /tmp/cad-hole-pieces-before --baseline
HOLE_RESULT_PIECES_FROZEN=1 node test/hole-result-pieces-browser.mjs /tmp/cad-hole-pieces-after
node scripts/test.mjs hole-result-pieces history-feature-apply hole-depth-contact-feedback
```

Baseline requires the pre-advisory product. Tests cover count/key/ref/duplicate/output guards, stale owner cases, failed commit, transformed accepted identity, wrong revision and failed evaluation. No broad assembly, nonterminal downstream, new Hole creation, other native topology or manufacturing qualification is claimed. Protected WIP/HOLD files untouched.
