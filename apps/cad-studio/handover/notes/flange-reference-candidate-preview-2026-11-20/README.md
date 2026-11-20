# Held Flange: preview two candidate edges before choosing

Focused #20 run, actual Chrome/WebGPU on exact `4bd39ab3dddc22a286b30eb72ee85d5201530f31`. An ordinary Difference moved the right rim of the synthetic sheet from X=80 to X=70 mm, leaving terminal Flange `n5` held. The native held plate was 5250 mm³.

[Preview candidate 1, top edge](01-candidate-top-preview.png) · [Preview candidate 2, bottom edge](02-candidate-bottom-preview.png) · [Top edge explicitly chosen](03-top-edge-explicitly-chosen.png)

Candidate 1 selected the unique top edge `n1.top|n3.side3` at (70,25,1.5) mm; candidate 2 selected the distinct bottom edge `n1.bottom|n3.side3` at (70,25,0) mm. Both are 50 mm straight edges. Preview changed only the displayed edge selection, not the accepted document, native geometry, history, dirty state, Undo/Redo, or active tool. Neither preview created a speculative Flange.

Only **Use candidate 1** repaired the original `n5` on the same Difference owner `n4` and kept the 20 mm flange length. Strict native volume was 6565.071880 mm³, agreeing with the independent 90° bend/strip calculation. Undo and Redo restored the exact held/repaired documents. Browser-project Save and fresh Open after reload restored the repaired document and native result without a file download.

See the [scoped verification receipt](verification.json). This checks the two listed preview choices and affirmative top choice in one synthetic terminal Flange, not arbitrary manual re-pick, the protected Split workflow, arbitrary features, or export.
