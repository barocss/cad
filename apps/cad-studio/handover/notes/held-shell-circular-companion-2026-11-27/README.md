# D2036: Recover a held Shell beside an independent cylinder

P1, [#20](https://github.com/barocss/cad/issues/20). [D2032](../held-shell-two-independent-bodies-2026-11-26/README.md) validated two independent rectangular extrusions next to one held single-opening Shell. Keeping one box and replacing the other with a plain circular Extrude made the exact prior Studio [hide Replace face](studio/00-prior-no-replace-face.png), although a valid planar opening candidate remained on the Shell's own body.

The companion predicate now admits a plain unattached circular sketch Extrude in addition to the previously supported rectangle. Output bounds, unique producer and mesh identity, visible owner, planar candidate, and explicit confirmation still gate the pick. The companion supplies no candidate. Attached circular sketches, multi-opening Shell, nonplanar replacements, dependent companions, assembly occurrences and general reference repair are not included.

## Verification

- Real macOS Chrome 158: exact prior baseline and fixed mixed-document flow. Clicks on the [cylinder](studio/01-cylinder-pick-refused.png), box and noncandidate owner face left the document and history unchanged. The [actual 360 mm² opening face](studio/02-owner-face-preview.png) enabled explicit Apply; Cancel remained a no-op.
- Applying the opening restored only Shell. Its dependent Chamfer remained held until separately confirmed. Two Undo/Redo steps and [Save then fresh Open](studio/03-fresh-open.png) preserved the right references and geometry.
- Native strict B-rep inspection passed for all three bodies. The independent box (2,304 mm³) and cylinder (250π mm³) were native-B-rep identical through preview, apply, history and reopening. Shell-only volume was 14,642.2654824574 mm³ before Chamfer.
- Unit coverage checks viewport slot/mesh identity and refuses a circular sketch attached to another body. Existing two-box Chrome behavior is the control. All 19 selected Studio tests and the Studio type check passed. See the [baseline](studio/prior.json), [mixed](studio/mixed.json), and [two-box](studio/boxes.json) receipts.

```sh
pnpm -C apps/cad-studio test held-shell-face-replacement held-shell-candidate-preview reference-decisions held-draft-face-replacement
export D2001_SOURCE_FROZEN=1 PW_DIR=/path/to/playwright CHROME=/path/to/chrome
node apps/cad-studio/test/held-shell-face-pick-browser.mjs /tmp/held-shell-circle --three --round
node apps/cad-studio/test/held-shell-face-pick-browser.mjs /tmp/held-shell-boxes --three
# On the prior product source with this test driver only, add --baseline to the mixed run.
```
