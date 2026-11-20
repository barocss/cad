# Section Hide, cap picking and Frame all (#258)

Tested on `dcdabf254dc2e9b3f7885a2beb20f7abaf406db4` in actual desktop Chrome Model with a live WebGL2 rendering context, on two rotated instances of a shared synthetic box and no base-part solids.

- At X = −1 mm, exclude Plate 2, then use [its ordinary Hide control](02-p2-hidden.png). Only its visibility is committed in the document. Both tested rays miss Plate 2 and the exclusion clears; the plane remains active. [Undo](03-undo-hide-p2-visible-but-clipped.png) restores the exact document and visibility, but not the stale exclusion: the retained half is selectable and the removed half is not.
- Native top face on Plate 1 at [2,15,11] reports original face 5. After orbiting to the removed side, the generated cap at [−1,15,7] reports cap=true and face=−1. Both actual clicks select the occurrence; the [cap click](05-generated-cap-p1-occurrence-pick.png) explicitly tells the user to use an original face for face operations.
- With the same orthographic camera orientation and canvas, public Frame all moved the X camera target from −6.718372 mm uncut to −3.718372 mm when both instances were cut. [Excluding Plate 2](03-excluded-native-edge-frame-all.png) returned the same exact camera pose as the uncut run, including distance 115.943802 mm. This compares camera targets, not unobstructed screen coverage. At [−7,40,11], read-only ray inspection gives the same original Plate 2 edge (body 0, edge 7) uncut and excluded, and no edge when both instances are cut. A public Edge-filter click on the silhouette did not select Plate 2; this is not evidence of public placed-edge selection.

No code or browser downloads. Results cover this WebGL2 fixture only, not every cap, edge, camera or interruption.
