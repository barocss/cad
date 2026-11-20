# Signed linear pattern spacing with a terminal Hole (#25)

In desktop Chrome Model, open a synthetic 4 × 6 × 8 mm stock at X=50 with an X Linear pattern (Spacing +16 mm, Count 3) and a terminal through Hole (radius 1 mm) on `n1.top@2`.

- In ordinary History, [Spacing 0](02-zero-spacing-refused.png) was refused with the keep-a-gap explanation and left the original accepted document and displayed History unchanged.
- Applying [Spacing −16 mm](04-negative-stock-bore-framed.png) keeps the same numbered face, Count and original stock. Native stock extents change from [50,54], [66,70], [82,86] to [18,22], [34,38], [50,54] mm; the hole center follows the last numbered copy from [84,13] to [20,13] mm. Both cylinder wall segments and the final top's extra loop remain valid, with unchanged volume 576−8π mm³.
- Actual Undo/Redo restores both exact model and native states. Typing +16 again returns the original exact model. No browser download or browser project Save/Open was exercised. The separate focused test encodes the negative state, reads it back through the Studio file reader and reverses it.

Browser product source: `dcdabf254dc2e9b3f7885a2beb20f7abaf406db4`. No product behavior changed. The regression was added as the only file in `17e721c6a2d24593cfae26677d8d161c14c089d0`, passed the scoped runner/lint, and [exact repository CI](https://github.com/barocss/cad/actions/runs/44721882791) passed.
