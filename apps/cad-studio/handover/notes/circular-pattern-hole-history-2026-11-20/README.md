# Circular-pattern History: Hole ownership and equal-axis Undo

Ownership slice for #20 and #25. Baseline `ec7770754a2b8fa7976c20d13c60cda661293a47`; product `3eff017f46802982a2b4672ba32413b7a94b73b6`. Actual Chrome/WebGPU created the ordinary D2 through Hole with a canvas pick and the Hole command on the third copy (`n1.top@2`) of a loaded synthetic, four-copy Z circular pattern.

[Before: first Undo retained the Hole](01-before-first-undo-retains-hole.png) · [After: first Undo removed the Hole](02-after-first-undo-removes-hole.png)

The Axis at X field round trip back to the implicit origin formerly added a History entry despite no geometry change. Now a single Undo reverts the preceding Hole and Redo restores it. Real pivot edits to X = 0.25 and 2 mm moved its center from (−12, −23) to (−11.5, −23) and (−8, −23) mm. Strict native validation confirmed four solids, the extra cut loop only on `n1.top@2`, and unchanged cut volume (768 − 8π ≈ 742.867259 mm³). Undo/Redo and private browser project Save, reload and Open retained the qualified result; a mixed Count + Axis edit was refused.

The 2/2 permanent tests independently exercise stale owner/revision rejection through controlled async replies. The actual browser check did not inject stale replies or qualify arbitrary patterns, axes, downstream features, or History preview. No export or download.
