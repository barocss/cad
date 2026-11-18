# #220: session-only inspection view Rename

The directory date is a local reporting label, not a UTC execution-date claim. This limited implementation does not complete #220. Integration checks, push and exact pushed-SHA CI are **PENDING**.

## Contract and actual path

Rename changes a session snapshot's name without recapturing its camera or visible bodies. It preserves row order, the other snapshot, active state and the first Apply's Restore target. The draft has explicit Save/Cancel; Escape cancels, blur does not save, and blank Save is disabled. Named views are not persisted in the native file.

The actual01 synthetic two-box flow created an oblique all-body snapshot and a Top A-only snapshot. It renamed the inactive A-only row while the all-body snapshot was live, without navigating; Apply then recovered the original Top camera and A-only visibility. Actual canvas probes selected A and missed hidden B. A second rename while active retained the active marker and subset. Restore recovered the initial camera and both bodies. Read-only camera observations and real canvas clicks were used, not hidden visibility or action injection.

Document payload, dirty indicator, visible History rows and Undo/Redo availability were unchanged before Save. A real native download retained the original document; fresh-context Open cleared the session views and Restore state. Separately, public native Open of another synthetic two-body owner discarded an in-progress draft; recapturing the old row name did not revive that draft. This is an owner-reset observation, not injected delayed-callback coverage.

## Results and history

- Baseline01 PASS: Rename was absent, while existing Apply restored the original camera/subset. Deliberately deleting and recapturing from a different live state changed snapshot contents. This was a feature baseline, not a product failure or a claim that all replacements inevitably lose state.
- Check01: 63/63 tests, Studio typing and scoped lint PASS, as verified by the coordinator. No full-suite claim.
- Actual01 passed on its first run. Receipt reports zero page errors, console errors and source changes; one native download; two contexts, browser and server closed.
- A Mac transport interruption happened during static review before heavy execution. After reattachment the hashes were unchanged. It is not reported as a failed test or an executed browser attempt.

## Evidence and limits

`renamed-original-subset.png` is the unmodified synthetic actual01 screenshot directly viewed by the coordinator. `inspection-pair.bcad` is the actual synthetic native download, without session views. `summary.json` is a sanitized selective receipt summary; `SHA256SUMS` covers the evidence files.

Stable internal row IDs, snapshot object identity and mock-hook behavior are **unit-only** coverage. Actual delayed callback races are **NOT_RUN**. Camera/visibility comparisons do not certify geometric accuracy, arbitrary assemblies, renderer failure, all devices, or permanent named-view support. Internal history-stack identity is not inspected. The original source document's native payload is preserved; changing the displayed bookmark name is deliberately session-only.

Only synthetic data is included. Raw receipts, HTML, logs, host paths, URLs, authentication material, source capsules and caches are excluded. This targeted validation evidence does not resume doc-sync or alter HOLD.

## Reproducibility

Validated baseline HEAD: `9a9e332cacab4167a5295664c1db8e3698e637e1`.
Integration parent: `c323ad22298a47f69ee8d7bf939e23932361459d`; integrated regression remains **PENDING**.

Commands, with working directory `apps/cad-studio`:

```sh
TEST_CONCURRENCY=1 node scripts/test.mjs named-inspection camera-projector camera-relative-query add-to-isolation small-camera-scale
../../node_modules/.bin/tsc --noEmit -p .
../../node_modules/.bin/eslint src/state/useNamedInspection.ts src/ui/NamedInspectionViews.tsx test/named-inspection-rename.test.ts
```

Validated source SHA-256:

- `apps/cad-studio/src/state/useNamedInspection.ts`: `2371827fe768629ffe01339223573c7217eb721de715f6439579f54e30409db7`
- `apps/cad-studio/src/ui/NamedInspectionViews.tsx`: `60f3675b5377b23c2fdc062ea6dd9c19599052035bbad46dd39b9d12627ed16a`
- `apps/cad-studio/test/named-inspection-rename.test.ts`: `2ad59618c23aa27ddc34311df18272f997ac87e3c3fc7c6c4772d7e1f2c2fb72`
