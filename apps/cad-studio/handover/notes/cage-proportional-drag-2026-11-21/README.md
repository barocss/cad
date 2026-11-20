# Connected proportional dragging in SubD Studio

P5, row 08, [#631](https://github.com/barocss/cad/issues/631). Uses the same graph and smoothstep falloff as the [numeric editing workflow](../cage-proportional-move-2026-11-17/README.md). Base commit `334a8d4d987e63c8462e25ba04190f8ddc0155e7`.

Start in Vertex mode and enable **Connected proportional drag**. **Drag graph radius mm** defaults to 10 mm. The option starts off for each cage editing session. At pointer-down, the gizmo captures the cage, vertex selection, graph weights, radius, document and pointer. Every frame applies the total movement to that baseline. Shift at pointer-down selects extrusion for eligible face and edge selections. During a vertex drag it retains its fine-snap behavior. The stored half-cage supplies graph distances in mirrored edits. Vertices on the mirror plane stay there.

The original desktop fixture exposed an unrelated ownership failure in the existing cage drag. Undo restored X = 20 mm and zero cage steps while a drag was held. The old physical release then applied its +3 mm to the restored cage, creating a new step. The same held pointer now loses ownership on Undo, cancel, or a change of cage session. Cancel and pointer ownership paths discard temporary geometry. A release with a matching owner makes one cage step only when coordinates change. Done remains gated on the evaluation of the current cage. App.tsx stays at 3,966 lines.

## Verification

- Model passed 110 cage checks, including five new cases for the shared XYZ drag operator, numeric parity, exact no-op, mirror constraints and independent graph weights. Studio passed 40 cage and gizmo checks. Changed-file lint, Model and Studio type checks and Studio build passed.
- In Chrome/WebGPU the seed at (20, 30, 26) mm moved 2 mm on X. With a 10 mm radius, two neighbors on Y moved 1 mm each, and two neighbors on X moved 0.3125 mm each. Every other vertex remained at its baseline. The renderer's visible gizmo followed the 2 mm displacement while the cage and accepted document counted zero steps. One pointer event and 100 pointer events gave identical accepted geometry. The opposite direction, default rigid movement, Escape before release, real lost pointer capture, and Undo during a held drag also passed.
- Cage Undo/Redo, Done, document Undo/Redo, native Save, and fresh desktop Open passed. The reopened editable cage matched the accepted document and evaluated to one solid of 9044.223951788 mm³.
- Native browser regressions passed for numeric proportional motion, rigid mirror no-op, extrusion readiness, Edge Slide, and assembly-gizmo Escape. The Shift-at-press check verified a 2 mm face extrusion even when Shift was released before the first movement. The browser receipts show zero page errors, console errors or watched changes.
- The initial pointer delivery qualified the cases above. The follow-up below adds influence feedback and verifies selection and file replacement. Mobile was not run.

Use Node 22.19.0. Run heavy tasks one at a time through the gate. Use the existing desktop Chrome and Playwright paths and external output folders.

```sh
node packages/barocss-cad-model/scripts/test.mjs cage
node apps/cad-studio/scripts/test.mjs cage gizmo
pnpm --filter @barocss/cad-model type-check
pnpm build
cd apps/cad-studio
CAGE_PROPORTIONAL_SOURCE_FROZEN=1 node test/cage-proportional-drag-browser.mjs "$OUTPUT/drag"
CAGE_PROPORTIONAL_SOURCE_FROZEN=1 node test/cage-proportional-move-browser.mjs "$OUTPUT/numeric"
CAGE_MIRROR_FROZEN=1 node test/cage-mirror-noop-browser.mjs "$OUTPUT/mirror"
D1326_SOURCE_FROZEN=1 node test/cage-commit-readiness-browser.mjs "$OUTPUT/extrude"
CAGE_SLIDE_SOURCE_FROZEN=1 node test/cage-edge-slide-browser.mjs "$OUTPUT/slide"
INSTANCE_GIZMO_SOURCE_FROZEN=1 node test/instance-gizmo-cancel-browser.mjs "$OUTPUT/assembly" escape
```

## Influence rings and interruption verification

During a weighted gesture, a turquoise ring marks each unselected vertex that has a positive weight. Selected vertices, poles and topology diagnostics keep their existing marks. The overlay follows the live cage, uses the frozen weight array, and disappears on release, cancellation and context changes. Both viewport backends use the existing overlay layers.

In the same desktop fixture, radius 7.5 mm showed two rings at the two independent 5 mm graph neighbors. Their expected X positions were 20 + 14/27 mm at +2 mm pointer displacement. Radius 10 mm showed four rings. Chrome screenshots were decoded and sampled around each independently projected point. WebGPU and WebGL2 both displayed the expected rings. The main browser also verified injected pointer cancellation, a selection-mode switch and native Open of a different file while the original pointer was held. No old gesture changed the destination cage or document.

A real drag on an X-mirrored cage qualified the half-cage policy. X +2 mm with radius 5 mm had no effect on the seam and left the history depth unchanged. Y +2 mm with radius 10 mm moved the seam vertex and its connected neighbors by their independent graph weights while preserving every X coordinate. Done, Save and fresh Open retained the mirrored cage.

The final tracked fixture uses `CAGE_PROPORTIONAL_SOURCE_FROZEN=1 node test/cage-proportional-drag-browser.mjs "$OUTPUT/drag"`. Scoped lint, Studio 40 cage and gizmo tests, Studio type check and build passed. All final desktop flows recorded zero console or page errors and zero watched changes. The Model, normal physical drag and broader related regressions are recorded above.
