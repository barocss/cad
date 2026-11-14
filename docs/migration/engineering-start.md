# Start development in BaroCSS CAD

The [active roadmap](../../apps/cad-studio/handover/roadmap.md) and its [decision log](../../apps/cad-studio/handover/decisions.md)
remain the technical reference. The former roadmap names refer to the original repository. Use the
[migration index](README.md) to find their current counterparts.

## First feature milestones

| Order | Scope | Acceptance |
| --- | --- | --- |
| 1 | Row 07. [D1274 delivered](../../apps/cad-studio/handover/notes/quarter-rim-fillet-api-2026-11-15/README.md). | Both TypeScript backends, independent geometry, and desktop Studio edit and reopen passed. |
| 2 | Row 07. [D1275 delivered](../../apps/cad-studio/handover/notes/two-guide-loft-2026-11-15/README.md). | Both native guide contacts, strict solid validity, independent History edits, Undo, Redo, and desktop Save/Open passed. |
| 3 | AI modeling. Make the qualified two-guide Loft available to the local CAD agent. | Discover the available inputs, preview an editable proposal, and apply it only after approval. Verify that Studio and the agent read the same committed result after reopen. |

An advanced modeling milestone must state what the user can create or edit and which real Studio workflow verifies it.
Fixes that directly block that workflow belong to the milestone. Other defects stay in the issue queue.

The first product acceptance baseline has eight of ten accepted scenarios. Whole CAD readiness remains unmeasured.
