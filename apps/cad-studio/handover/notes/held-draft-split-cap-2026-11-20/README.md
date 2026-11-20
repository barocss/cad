# Held Draft: explicitly replace a lost Split cap

Focused #20 Chrome/WebGPU evidence. Baseline `d205a90e5dc1b5d565d4439c0d2dfaeb810afb98`; product `7475cf4d7786b2befc2707b73c756bb40abb053b`. On a synthetic 60 × 30 × 10 mm box, reversing an X-oriented Split leaves terminal Draft `n3` held because its original `n2.cut.side1` face vanished. The baseline remains two 9000 mm³ halves and offers no replacement.

The final implementation keeps that reference diagnosis through the normal Browser eye control. An earlier candidate lost the diagnosis after hiding a half; the final actual run opened the original both-visible fixture, clicked the normal eye as appropriate, and kept Replace face available. A real click on the sister cap and a click on an ordinary wall were each refused without changing the document. The correct physical cap produced a preview, and Cancel left the held document and history unchanged.

A separate explicit Apply repaired the original `n3` without replacing the feature or changing 10°, +Z pull, fixed neutral 0, or its negative Split owner. It stored `n2.cut.side3` at (30,15,5) mm with normal (−1,0,0) and plane area 300 mm². The native volumes were 8735.509529 mm³ for the drafted half and 9000 mm³ for the untouched half. One Undo restores the held state and Redo restores the repair. Saving into browser project storage and reopening after reload retained the repaired document and volumes without a local file download.

[Wrong sister cap refused](01-wrong-sister-cap.png) · [Correct replacement preview](03-replacement-preview.png) · [Reopened repaired Draft](05-recovered-opfs-reopened.png)

This qualifies this terminal Draft on the proven rectangular Split cap only. Stale reply and competing preview ownership are covered by the focused tests, not a fault injected during the browser run. No general rematcher, route support, export, or manufacturing acceptance is claimed.
