# D2010 — Source-bound curved drawing centerlines

2026-11-25 · P2 Drawings · [#242](https://github.com/barocss/cad/issues/242) · Parent: `b7645021346e3fe68c4ee7c3adba79f7640d4fc7`.

## Scope

In an ordinary unbroken front, top or right part view, select two visible, unclipped native partial arcs. They must have a common 3D center and plane, unequal radii and the same directed geometric interval. The mark uses the mean radius in model mm and follows the common angular span. Reversed traversal and the zero-angle seam do not change the result. Unsupported or unresolved sources do not produce a normal mark.

The first picked arc remains highlighted, the second is previewed under the pointer, and a selected annotation highlights both current sources. No draft is written until the second valid pick; Escape leaves the document alone. The global Centre lines toggle hides the mark without deleting its references. The native drawing record stores its own ID, view and two edge references. SVG retains a separate markup identity. DXF writes one non-associative ARC on CENTER, not a native dimension or an associative centerline. This does not add model geometry or a 3D PMI dimension.

## Evidence and limits

- Type-check, scoped ESLint, and Studio production build passed. The broader selected Model run had 80 passes and two pre-existing failures (one-page PDF hash and plate DXF fixture); the same two failed when bundling the exact parent versions of the changed Model sources. Their goldens were not changed.
- The focused Model tests cover a native 90° annular sector (R12, endpoints (12,0) and (0,12), mid-point (6√2,6√2)), wraparound, rejecting invalid pairs, edited radii, old-shape read defaults, sheet ownership, reorientation, reference collection and lost-reference reporting, SVG and DXF.
- Actual Chrome on a synthetic 50 × 50 × 15 mm filleted shell: straight and duplicate-edge refusals, draft without a document change, two-source highlight, centerline creation, visibility toggle, delete/Undo/Redo, actual SVG and DXF, fresh .bcad Open, then Shell wall 4 → 2 mm. The centerline radius updated from R12 to R13 after the source edit. The DXF check independently reads one CENTER ARC with radius 12 mm and span 90° at 1:1.
- [Placed R12 and inspected sources](01-placed-r12.png) · [Hidden mark, retained record](02-centers-hidden.png) · [Raw native project reopened](03-reopened-saved.png) · [Source edit updates the mark to R13](04-after-shell-t2.png).

This is a bounded delivery, not complete #242 qualification. Use a Studio version supporting curved centerlines to edit and re-save new files: an older reader that rebuilds drawing settings without the new field can omit the annotation on re-save. There is no schema migration, no older application round-trip guarantee, no external receiver test or deferred PDF golden claim. Desktop second-sheet export, broader stale-source lifecycle coverage and the complete compatibility matrix remain outside this receipt. Endpoint grips, straight/silhouette bisectors, assembly sections, general splines and unequal arc extents remain out of scope.
