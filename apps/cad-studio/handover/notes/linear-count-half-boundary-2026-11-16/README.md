# Linear Count half-interval boundary (#25, bounded follow-up)

Base: `43bf5cb2c38f44ffc4e7ec33b8816481eb5556d2`. No production change needed.

Added `--half` to the existing signed-spacing browser driver; no broad repetition of earlier axis/file qualifications. Actual Chrome WebGPU 1440×1000, Top Ortho, X Separate bodies, spacing −16 mm, initial Count 3:

- In one held pointer gesture, world-projected offsets +7.84/+8/+8.16/+7.84 mm yielded Counts 3/3/2/3. Offsets −7.84/−8/−8.16/−7.84/−16 mm yielded 3/4/4/3/4.
- Both half-interval crossings recover in the same drag. Spacing remains −16; document remains the original throughout preview.
- The exact mathematical formula uses `Math.round` on the positive Count. Its half ties round upward: 2.5→3 and 3.5→4. Browser ±8 mm samples agree here, but screen-coordinate floating-point conversion can land either side of an exact tie. Accordingly only ±7.84/±8.16 bracketing samples have deterministic transition assertions; exact screen samples are recorded, not universal exact-tie claims.
- Final Count 4 Apply produced four strict-valid native bodies, each 192 mm³, X centroids 4/20/36/52 mm, Y13 and Z4. Undo/Redo retained the expected documents.
- PASS receipt, no runtime/console errors, frozen-source changes or downloads. Outward crossing screenshot visually reviewed. Driver syntax and diff checks pass. No production changes, full suite/build rerun or new file-roundtrip claim.

Run from Studio with normal heavy-run gate, `PW_DIR`, `CHROME`, `D1194_SOURCE_FROZEN=1`:

```sh
node test/linear-signed-spacing-browser.mjs <artifact-directory> --half
```

This is one negative-spacing X case, not every axis/decimal/zoom. #25 remains open for its broader source/path acceptance. Original WIP and HOLDs are untouched. Further work should prioritize unresolved functionality rather than repeat these passed pattern cases.
