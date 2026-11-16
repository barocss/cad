# #268: WebGL2 SVG annotation text picking

## Bounded repair

The WebGL2 fallback draws camera-facing 12 CSS-pixel SVG text, but the prior picker used the original world-plane baseline and a character-count width estimate. This change reads the currently committed SVG text's actual DOM bounding rectangle. It is a text box, not a per-glyph ink/pixel hit test or an occlusion certificate. No radius inflation or approximate font metric replication is introduced.

The committed SVG owns the exact annotations array, renderer, canvas, camera state and client size. A click reads current DOM bounds only if this ownership still matches. Missing/stale evidence yields no text hit and never falls back to the old world span. Whitespace, zero/nonfinite boxes, behind-eye anchors and boxes outside the canvas are excluded. Partly visible boxes are clipped to the viewport. DOM layout is read at click time, so font metric changes are not cached.

Existing line picking, array-first equal-distance ties, annotation ID callback and source-reference mapping remain. GPU label rendering and picking remain unchanged (undefined bounds selects that old path). No Model/API/schema/native/geometry/save changes. The SVG ref/currentness and geometry policy are separated in a private consumer helper, not exposed as a new global GPU API.

## Verification

- PMI/SVG bounds/camera focused tests: 23/23 PASS. Cases include collapsed old baseline versus actual boxes, no outside halo, stale source/renderer/canvas/camera, disconnected DOM, partial clipping, live font-box change, empty/behind-eye and deterministic tie/line competition.
- Studio TypeScript and scoped lint PASS.
- Actual forced WebGL2 browser: PASS at DPR 1 and 2. Synthetic 30 x 12 x 6 bracket front annotation `4× 30 ±0.1234`; displayed text box 93.609375 x 15 CSS px. Clicks at 3%, 50%, 97% select `frontwidth`, including after wheel zoom and 1024-wide resize. Outside-box miss, hide, external Open without dimensions and New retire old text selection.
- Actual accepted document and dirty state preserved by annotation selection. Repeated front/middle/end selection yields the same body 0 edge 2. Source targets are n1.side0|n1.top at [0,0,6] and [30,0,6]; screenshot independently shows the top X-direction 30 mm edge selected and unchanged 2160 mm3 geometry. Raw source mesh names were not captured by this browser receipt, so no new native-topology certification is claimed.
- Screenshots reviewed at DPR1 selected source and DPR2 resized. Final receipt has no product/console errors, source changes or downloads; both contexts, browser and server closed.

Driver: `test/pmi-svg-hit-browser.mjs`, run from repository root with `PMI_SVG_HIT_FROZEN=1`, PW_DIR and CHROME, source frozen and shared heavy gate held.

## Failures retained / remaining scope

First run stopped before browser with a wrong-cwd fixture ENOENT. Second stopped at a harness exact JSON string comparison: Open correctly normalizes key order and drops empty notes. The driver now independently checks nodes/dimensions/projection/scale/units/dual/views/hidden and equivalent empty notes, then captures the accepted Doc for subsequent invariant checks. Third actual run PASS. Neither failure is reported as a product pass or concealed.

GPU camera-facing/planar bounds remain unresolved: the current public viewer API exposes neither exact atlas/layout metrics nor label bounds. Private GlyphAtlas internals are not imported and GPU labels are not silently moved to SVG. Full #268 remains OPEN. GPU actual behavior, orbit threshold transitions, GPU→fallback regeneration, all alignments/frame cells, file Save/fresh Open, full aggregate suite and mobile are NOT_RUN in this bounded pass. Existing WIP/HOLD and shared GPU ownership are preserved.

Final additional checks: existing selection-edge tests 6/6 PASS, browser-driver lint PASS, Studio Vite build 3.87 seconds PASS.
