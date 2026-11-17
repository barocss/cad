# Selected-vertex plane guidance: bounded actual acceptance

Parent: `6a8bff83c`. Read-only #216 explanation and current-frame display; no new topology, schema or geometry producer.

## Baseline interruption and resumed checks

The original baseline requested the shared heavy lane with a 120-second budget. The gate returned exit **75** after **129 seconds**, reporting load **71.98** and “nothing ran.” No browser was started and no baseline screenshot exists. Freeze was released with no bypass or automatic retry. Parent source lacks the explanation, which is static evidence only.

After an explicit resume, final driver syntax/lint, product focused **4/4**, Studio typecheck, scoped product lint and production build **7.95s** passed. Actual `/tmp/cad-three-vertex-guidance-after-01` then passed on its first browser execution. Logs and their original SHA256 are in [logs.txt](logs.txt). Earlier NOT_RUN status is superseded only for those checks actually completed; baseline actual remains NOT_RUN.

## Implementation

`src/ui/VertexPlaneSummary.tsx`, composed in `src/ui/SketchPanel.tsx`, appears only for a current `vertices` anchor with a captured `vertexPlane`. It presents current origin, +X, +Y and normal; describes ordered-point capture and the fixed snapshot; and distinguishes offset/angle adjustments from that capture rule.

The display is approximate **six significant digits**. +Y uses existing `yAxisOf`, including its 1e-9 cleanup. This does not promise retention of every tiny component or certify native precision. Inputs, geometry and saved document fields are unchanged.

Focused tests: `test/vertex-plane-summary.test.ts`. Browser/evidence: `test/three-vertex-frame-guidance-browser.mjs` and this folder.

## Actual scope and independent arithmetic

Public pointer picks selected P0 `[0,0,10]`, P1 `[60,30,10]`, P2 `[60,0,0]` on one native box, then entered Sketch on Selected vertices.

- Independent arithmetic derives X=unit(P1−P0), N=unit((P1−P0)×(P2−P0)), Y=N×X. Actual displayed vectors match six-significant-digit expectations.
- Offset2/angle30 uses N'=cos(30°)N+sin(30°)Y, origin=P0+2N', Y'=N'×X. Current-frame numbers and the adjusted-vs-captured explanation were checked.
- A fresh-context run swaps the second and third picks. X/Y change and the normal reverses as expected; all displayed vectors match the independent calculation.
- XY switch has no vertex-specific claim. Reopening the existing source sketch via History extrude → Edit sketch also has no invented captured-vertex claim.
- Accepted document stays exact through these draft/read-only operations. Around passive summary inspection, document, dirty indicator and Undo/Redo availability are unchanged. Plane draft edits may legitimately affect draft history; they are not presented as no-op history operations.

[Vector expectations and actual display values](vector-oracle.json) preserve all three comparisons. They use independent JavaScript vector arithmetic, no product geometry import. This verifies the display contract, not full-precision native geometry.

## Screenshots and receipt

- [Original current frame](02-current-frame.png).
- [Offset2/angle30 adjusted frame](03-adjusted-frame.png), including capture/current distinction and fixed-snapshot wording.
- [Second/third picks swapped](05-swapped-frame.png).

Actual pixels were inspected: all are synthetic box fixtures, no personal information. [Curated receipt](receipt.json) retains the original receipt hash, observations and cleanup. Source capsule **534 files unchanged**, zero errors/console errors/source changes. Three contexts, browser and server closed; heavy gate and source freeze released before notes were updated.

## Reproduction

From `apps/cad-studio`, Node22:

```sh
node --check test/three-vertex-frame-guidance-browser.mjs
pnpm exec eslint test/three-vertex-frame-guidance-browser.mjs
node scripts/test.mjs vertex-plane-summary
pnpm exec tsc --noEmit
pnpm exec eslint src/ui/VertexPlaneSummary.tsx src/ui/SketchPanel.tsx test/vertex-plane-summary.test.ts
pnpm run build
# Freeze writers and acquire the normal shared heavy lane first.
THREE_VERTEX_GUIDANCE_FROZEN=1 \
PW_DIR="$HOME/.cache/barocss-playwright" \
CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
node test/three-vertex-frame-guidance-browser.mjs /tmp/cad-three-vertex-guidance-after-01
```

`createFlow` hashes initial pins (including the summary component) and the actual dependency capsule, then compares through cleanup. The parent-product `--baseline` mode expects absent guidance and must not be run against the new implementation.

## Limits

Face-entry actual is **NOT_RUN**. Existing saved-sketch reopening is not a claim about persistence of vertex capture provenance. No new extrusion, Save/Open, source-edit propagation or native numerical accuracy run was performed. Earlier [D792 geometry/lifecycle evidence](../three-vertex-sketch-plane-2026-11-12/README.md) remains historical evidence, not a new PASS. This bounded explanation/display acceptance does not itself close all of #216. Existing WIP and HOLD scopes are unchanged.
