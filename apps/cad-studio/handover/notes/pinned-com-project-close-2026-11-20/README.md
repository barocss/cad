# #231 project-close COM lifecycle: actual PASS

Source: e4359b68450ca1a93775c629641295974c393acf. No product changes. Validates the original project-close reset condition, not overall issue completion.

## Public reproduction
1. Open a synthetic schema-3 document with two 10 × 10 × 10 mm extruded cubes: A at X 0–10, B at X 30–40; materials Aluminium 6061 and Steel; stable body IDs b1/n1 and b3/n3.
2. Project and versions → enter a unique synthetic Browser project name → Project in this browser. Do not Save.
3. Browser select Cube A and Shift-select Cube B → Pin selected bodies’ COM.
4. Observe mass 10.55 g and centroid (5765/211, 5, 5) mm. Each current native body volume is 1000 mm³ within 1e-8.
5. Close project. Observe no project and no pinned COM marker/readout; both bodies remain selected.
6. Reopen the same empty browser project without opening a document. No pin resurrection.
7. Explicitly Pin selected bodies’ COM again. Analytic mass/centroid returns.

At Close, reopen and repin, accepted document, entire selection snapshot, dirty flag, feature-history labels and Undo/Redo availability/tips were compared exactly with the pinned state: unchanged. Source capsules before/after/cleanup matched. No page/console errors, source changes or downloads. Context/browser/server closed.

## Original screenshots
- 02-closed-cleared.png: no project, both selected cubes retained, no pinned COM marker/readout.
- 04-repin.png: empty synthetic project reopened, explicit repin restores analytic COM.

result.json is a sanitized extract, not the original complete private receipt. PNG SHA-256 matches original unmodified bytes. Displayed UUID is synthetic randomly generated project data.

## Limits
No Save, download, project-document Open, Worker restart, delayed mass delivery, pan/zoom or overall issue closure proof. Empty-project reopen is not saved-document persistence validation. Floating-point numbers use independent analytic tolerance, not rounded screenshot text. No product defect/fix claimed.

## Portable actual driver
`project-close.mjs` is the executed driver with only source checkout location made portable via CAD_REPO. It preserves the full SHA assertion, public actions, predicates and tolerances. This portability-only copy was syntax checked, not executed again. Use the existing installed Playwright/Chrome dependencies and serialized heavy reservation before running:

```sh
CAD_REPO=/absolute/isolated/checkout PW_DIR=/absolute/playwright CHROME=/absolute/chrome PINNED_MASS_RECOVERY_FROZEN=1 node project-close.mjs /absolute/external/evidence
```

Start from the exact source commit above, keep the checkout frozen and ensure at least 2 GiB reserve. No Save/export action occurs. `synthetic-two-cubes.bcad` is the synthetic accepted input, not a browser download.
