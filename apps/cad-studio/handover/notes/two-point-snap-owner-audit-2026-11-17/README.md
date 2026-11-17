# #229 — calculated-point owner audit (partial)

**NOT_QUALIFIED actual attempt; Project Open lifecycle acceptance remains NOT_RUN.** No product changes. The failed attempt is evidence, not a runnable CI test or product failure.

## Actual attempt

`/tmp/cad-two-point-project-open-01` saved replacement B into a unique local OPFS project and read its complete expected JSON bytes. This observes readable bytes, not writable.close itself. Detached A's public XY construction (0,0)→(31,13), ratio .25, produced the pending point (7.75,3.25).

`Open B.bcad` then timed out. Failure DOM and App source show `versionsVisible` requires `!sketch && !active`. Toggling the toolbar cannot show Versions during the pending sketch. Keep editing and accepted Project Open were not reached. No injected state, synthetic event or repeat attempt was used. Pending point and marker remained visible.

## Archived driver

`attempt-driver.mjs` is the unchanged original `apps/cad-studio/test/two-point-snap-project-open-browser.mjs`, moved out of the CI test directory. It ran from `apps/cad-studio` with TWO_POINT_PROJECT_FROZEN=1 under the heavy gate. Its `./flow-helper.mjs` import and pinned path refer to the original location. It is intentionally not directly runnable here; do not count it as qualified acceptance.

## Evidence boundaries

- [D793](../two-point-sketch-snap-2026-11-12/README.md): two-point Rectangle consumer/persistence.
- [D794](../signed-sketch-snap-offset-plane-2026-11-12/README.md): signed distance/offset-plane scope.
- [D925](../two-point-snap-file-open-2026-11-13/README.md): invalid File Open retains pending point, accepted File Open retires it and allows fresh input. File Open is not Project Open.
- New owner-hook tests **3/3** and root Studio tsc PASS (`/tmp/cad-two-point-final-tsc.log`) are separate focused evidence, not browser Project Open proof. Driver syntax/lint PASS before the attempt.
- No native oracle, production build or broad suite was rerun. Source-edit during picking remains NOT_RUN. Whole #229 completion is not claimed.

Raw FAIL/capsules remain in the run directory; curated [receipt](receipt.json) preserves classification/cleanup. Runtime and console errors and source changes are empty; frozen and after-cleanup source hashes match. Context, Chrome and Vite closed, gate released, source freeze ended. No native folders, WIP or HOLD changes.

[Pending state](01-pending.png) and [unavailable Project Open path](failure.png) were directly inspected by implementer and parent: synthetic data, no personal information. The failure image shows 7.75,3.25, ratio .25, Calculated marker and no Versions panel. It documents an inaccessible public path, not product error or completed acceptance.
