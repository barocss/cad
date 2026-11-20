# Pinned centre of mass: edit an existing Move

#231 evidence only. Actual Chrome/WebGPU at exact `5991acb6274da22fb78073704c7ba30def53baba`. In a synthetic two-solid part, the normal Parameters UI changed `ShiftX` from 10 to 20 mm. Cube B kept the same accepted Move owner `b4 / n4 / translate`. Its centroid moved from X=35 to X=45 mm while Cube A remained at X=5 mm and both native volumes remained 1000 mm³.

After one initial pin, the same two-body COM retained its 10.55 g mass (2.70 g aluminum plus 7.85 g steel). Its analytic X moved from 5765/211 ≈ 27.322275 mm to 7335/211 ≈ 34.763033 mm (Y=Z=5 mm). Undo restored the first position and Redo restored the second, without re-pinning; the SVG marker followed the projected position throughout.

[Before editing the existing Move](01-before-existing-move.png) · [After editing the same Move](02-after-existing-move.png)

The first harness attempt assigned Cube B’s appearance/material metadata to result key `b4`, so Studio correctly used the default material. The successful second attempt corrected only that synthetic metadata to the originating solid’s inherited look key `b3`; the result owner and product source were unchanged. The successful run used one Chrome process, closed its context/browser/server, and recorded no errors, source edits, or downloads. This does not qualify adding a Move, replacing an owner, general transforms, export, or manufacturing use.
