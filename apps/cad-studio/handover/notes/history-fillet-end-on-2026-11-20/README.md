# Drag the radius of a History Fillet from an end-on view (#214)

In desktop Chrome, a synthetic 40 × 30 × 10 mm rectangular solid was filleted by selecting the original straight edge `n1.side0|n1.top` in the viewport. The uncomplicated constant-radius Fillet `n2` was created at R2, then edited in History in an orthographic view looking end-on at the handle's direction.

- [Before](01-original-end-on-r2.png), on `b1c0e52e3becb35be8e3d5d428e7463d37247e43`: real pointer movement left the radius at 2 mm. The handle direction's screen projection in this view was effectively zero.
- [After](02-fixed-end-on-r3-5-preview.png), on `37ba435ee21a7f6f069f0d526ea07b15da464457`: dragging up/down updates the radius; wheel zoom during the held gesture does not change its conversion. Cancel preserves R2. Explicit Apply sets R3.5 on the same Fillet and edge. Native output agrees with an ordinary side-on drag and a typed History R3.5. Undo/Redo restores the exact models.
- [Controlled pending input](03-pending-shift-face-pick.png): delivery of the original native source request was delayed, not replaced. Pressing and moving an end-on radius handle awaiting proof does not start a drag, even if the proof arrives before pointer-up. Shift+click in the Face filter still selects the same real underlying face while waiting and does not start a radius edit.

The exact product passed 60 focused tests, scoped lint, Studio typecheck, production build and [CAD CI](https://github.com/barocss/cad/actions/runs/44713065450). No downloads. This verifies a qualified existing straight-edge constant History Fillet, not all fillet variants or arbitrary gizmos.
