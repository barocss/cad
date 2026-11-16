# Optional camera framing when reopening sketches (#254)

Base: `b94738d83dc1715eaf72fcc8c6ba380d703fc154`.

## Contract

Display and previews → **Auto-frame reopened sketches** defaults on. Off skips the successful existing-sketch reopen framing call completely, preserving target, distance, yaw, pitch, fovY and ortho. It does not move the sketch plane or rewrite geometry. New Sketch, explicit plane changes and project Open keep their existing policies. No delayed camera restoration or per-render framing is added.

The local UI key `studio.sketch-reopen-frame` accepts `off`; missing or invalid data defaults on. Access/write failure preserves a session choice and labels it session-only. The option is not part of the document, history, schema, render cameras or assembly steps.

The compact **Normal and fit sketch** view button is explicit active-plane recovery. It shares the existing frame calculation and requires the exact current plane and sketch generation. Existing direction-only Normal to sketch remains available. Camera controls refuse while a text input is active, without blur-committing that input.

Manual recovery also includes the current shape/done extents, not only accepted bodies. Rectangle, circle, slot, arc cardinal extrema and attached circles are covered; Bézier control hull and band-circle bounds are conservative framing bounds, not new geometry measurements. Existing `bandLoops` supplies the band envelope including offset/width. Hidden construction is excluded unless needed for the visible band envelope. The automatic reopen region is deliberately unchanged.

## Actual browser proof

The driver uses real UI camera orbit/pan/zoom and Edit sketch, not a camera setter. XY-offset, vertical and tilted polygon extrusions each run in perspective and orthographic views. The XY perspective case uses 1024×800; the others use 1440×900.

All six camera fields are compared before and after off reopen. On retains automatic framing. Explicit recovery faces the real plane and preserves projection. Subsequent orbit/pan/zoom and local-mm edits do not trigger automatic reframing. Finish changes width 20→25 and volume 1500→1875 mm³ while preserving plane, IDs, side tags and the untouched extrusion parameter binding. First Undo/Redo returns exact accepted documents. Actual OPFS Save bytes, Close, reload and Open preserve edited geometry separately from the browser preference.

Missing/invalid values and denied storage writes have separate checks. The read-only DEV camera snapshot exposes no camera mutation seam. No production geometry/solver/ray-plane tolerance changes are made.

Initial actual run failed on the test assumption that explicit origin-zero XY plane must remain serialized after Finish. Existing Finish legitimately normalizes that default plane. The corrected fixture uses offset XY, so literal plane retention is meaningful. This was not a product regression.

## Verification

Focused regression command:

```sh
node scripts/test.mjs sketch-reopen-camera manual-sketch-region sketch-framing project-open-fit camera-projector small-camera-scale assembly-steps
```

**61/61 PASS**, Studio typecheck PASS, affected-file lint PASS excluding App's pre-existing unrelated `_k` unused variable (currently line 2440), production build PASS (4.75 s; existing chunk-size warning), diff check PASS. No claim of full-repository lint or hosted CI success.

Actual edge-on and far-pan camera states are preserved with off, then recovered by the explicit action. A focused unit check separately verifies the unchanged parallel/near-parallel/behind-plane ray rejection and normal-aligned center-ray recovery; no claim is made that every small angle is rejected. Actual focused-input attempts refuse without camera movement. A draft enlarged to 1025 mm width beyond accepted-body bounds is fitted, with all four projected corners inside the free viewport; Cancel leaves the accepted document unchanged. Screenshots were reviewed, including the intentionally thin enlarged draft.

The first complete final matrix passed, then the band return coordinates received numeric TypeScript guards (resolved numeric band values were already passing). The first post-guard run passed the UI assertions but was invalidated by the freeze watcher when this verification note was edited during execution. It is not counted as PASS. The exact post-guard source is rerun with no concurrent file writes as the final frozen receipt. No native-folder validation is inferred from the OPFS check.

Run the browser driver after the heavy-run gate with `PW_DIR` and `CHROME`:

```sh
SKETCH_REOPEN_CAMERA_FROZEN=1 node test/sketch-reopen-camera-browser.mjs <output>
```

 Native-folder/picker, new WebGPU CI, Physics/Motion and every existing HOLD remain excluded. The protected original checkout's eight WIP entries are untouched.

Final post-guard frozen Chrome run: **PASS** across all eight camera cases, storage/session and file checks, with zero runtime/console errors, watched-file changes and downloads. Final recovered edge-on screenshot was visually reviewed.
