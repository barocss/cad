# D1521 — Isolate the visible Smooth Turn shading lines

P5, row 07, [#630](https://github.com/barocss/cad/issues/630). Base `188712930f17df98bd6eb8d82737f08addb6994a`.

Compare the same saved +450° Smooth Turn at the same perspective camera in desktop Studio with actual WebGPU. Use the D1520 file with the ruled control beside it. Change only Ambient occlusion (AO), then inspect the exact model in wireframe and restore the original view.

- **PASS, fixed-camera desktop comparison.** The fine bands appear with AO on and disappear with AO off. Wireframe shows the end rings and the four continuous twisting corner rails. Three projected axis points match exactly in each capture. Restoring AO and shaded-with-edges restores the original pixels of the right-hand region. No document edit occurs.
- **PASS, independent pixels.** In the 255 × 635-pixel right-hand region at (700, 245), switching AO off changes 69,465 of 161,925 pixels. Restoring the initial setting changes zero pixels in the same region. These counts establish the tested view dependency. They do not estimate a correction to geometry.
- **PASS, native and quality controls.** The Smooth Turn keeps its strict six-face, twelve-edge native solid and digest `5c9f9909e18cf166d3c45171c2e53a756a1cb1be3cf1dc628688ba69e3c3c7a9`. For native display meshes at quality 8, 12, 16 and 24, face names and edge ownership match exactly. Triangle counts are 2300, 4884, 8564 and 18596. Browser syntax and Git diff checks pass.
- **NOT_RUN.** Alternate renderer, alternate in-browser tessellation quality, wider AO scenes, full local suites and mobile. #630 and the separate renderer work remain open.

Use the native file from the last D1520 Studio Save. Use Node 22.19.0 and installed desktop Chrome and Playwright. Gate the desktop run, freeze the worktree and retain evidence outside Git.

```sh
node --check apps/cad-studio/test/smooth-turn-display-browser.mjs
git diff --check
cd apps/cad-studio
SMOOTH_TURN_DISPLAY_FROZEN=1 node test/smooth-turn-display-browser.mjs "$EVIDENCE/display" "$D1520/ruled-and-smooth-turn.bcad"
ffmpeg -loglevel error -i "$EVIDENCE/display/smooth-turn-shaded-ao-on.png" -vf crop=255:635:700:245 -frames:v 1 -f rawvideo -pix_fmt rgb24 -
```
