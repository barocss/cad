# Pinned centre of mass: viewport projection and picking

#231 evidence only. Actual Chrome/WebGPU tested exact `174bc963570527e3af67237e7c03e334f80850db`. The later evidence parent `beac87fc036acc23b9fd963f5ee657194329df78` adds Retry evidence and a focused Arc Radius test and evidence, not viewport code.

Two ordinary synthetic solids of different materials produced a combined COM of 10.55 g at (27.3222748815, 5, 5) mm. The actual SVG marker center (using its transformed screen coordinates) stayed within 0.001 px of the expected world COM projected through the camera in the tested initial view, middle-button pan, wheel zoom, and desktop resize. The visible label stayed within the viewport. A real canvas pick at the same point returned the same underlying face with and without the glyph.

After the final selection checks, Clear removed only the session marker. The accepted document, dirty flag, History, Undo/Redo, selection, and native meshes were unchanged across Clear, with no additional evaluation. The two screenshots show different selections because the real pick checks ran between them; the Clear assertion compares the state immediately before and after Clear.

[Marker after viewport resize](01-resize-current-world-marker.png) · [Model after clearing the marker](02-cleared-no-geometry-effect.png)

This qualifies only the tested desktop Model views and ordinary native solids. No claim about arbitrary zoom, annotations, snapping, Move, export, Print, CNC, or manufacturing use. No Save, download, or source change during the run.
