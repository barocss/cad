# Saved Fastener hole evidence is a snapshot (#31, partial)

The placement contract stores coordinates and hole diameter/depth/through values, not a persistent source feature/body/edge reference. Moving an authored hole therefore does not move a Fastener. No association can safely be inferred from equal coordinates or similar geometry.

The existing Edit Fastener fit step now says **Saved hole**, does not show a completed/current-fit check, and explains that the values are a snapshot, not a live link. It directs an explicit reposition through Axis at X/Y and Seat at Z if the hole moved. This applies to grouped History and direct saved edits. Creation-time hole picking keeps its existing fit step. Re-entering the same coordinate retains evidence; a genuine manual position change clears the old evidence. Build-time too-small-hole refusal is unchanged.

## Impact-based verification

- Focused model coverage compares saved grouped/direct steps with live creation, same-coordinate retention, genuine movement and fit refusal. No document mutation from reading guidance.
- Actual frozen Chrome driver `test/fastener-hole-movement-browser.mjs`: move plate Hole Centre X from 32 to 44; verify Fastener group remains unchanged at X32; open ordinary History and inspect saved-hole guidance; explicitly reposition Fastener to X44 without changing the hole; Undo/Redo and memory-file reopen. No physical download.
- Model/Studio TypeScript, targeted lint and Studio production build checked. Screenshots and private receipts retained under `/tmp/cad-fastener-hole-movement-browser-01`.

This is truthful guidance, not automated movement detection or persistent association. Mount catalogue/group History remains separate; #31 stays open. #126 WIP and existing HOLD scopes remain untouched.
