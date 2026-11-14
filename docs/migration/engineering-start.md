# Start development in BaroCSS CAD

The [active roadmap](../../apps/cad-studio/handover/roadmap.md) and its [decision log](../../apps/cad-studio/handover/decisions.md)
remain the technical reference. The former roadmap names refer to the original repository. Use the
[migration index](README.md) to find their current counterparts.

## First feature milestones

| Order | Scope | Acceptance |
| --- | --- | --- |
| 1 | Row 07. Complete D1274, the TypeScript facade for the verified 90° variable fillet. | Create in both TypeScript backends. Independently check both end sections and volume. Edit and reopen the generated document with desktop Studio. |
| 2 | Row 07. Qualify a Loft controlled by two guide curves. | Pick two guides that constrain different section points. Edit each guide independently. Check both guide contacts, native solid validity, Undo and reopen. |
| 3 | AI modeling. Make the qualified two-guide Loft available to the local CAD agent. | Discover the available inputs, preview an editable proposal, and apply it only after approval. Verify that Studio and the agent read the same committed result after reopen. |

An advanced modeling milestone must state what the user can create or edit and which real Studio workflow verifies it.
Fixes that directly block that workflow belong to the milestone. Other defects stay in the issue queue.

The first product acceptance baseline has eight of ten accepted scenarios. Whole CAD readiness remains unmeasured.
D1274 was uncommitted when the repositories were separated. It stays in the original development worktree until its
verification resumes.
