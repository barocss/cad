# #220: session-only named inspection views

Partial implementation; existing issue stays OPEN. No persistent named-view format, codec, migration or sidecar is introduced.

Two named camera + temporary visibility snapshots on current ordinary base solids. App owns one transaction; appearance supplies the shared hidden-body mask and Viewport applies the camera once in layout commit. Design-hidden bodies cannot be revealed. Document, source identity and worker/project owner changes discard snapshots; incompatible modes discard the active preview without restoring an old camera. Explicit Restore recovers the pre-inspection camera and design visibility. Manual navigation changes active indication, not the temporary mask.

## Verification
- Dedicated pure/lifecycle tests: 7/7. Lifecycle uses a mock hook harness, not a renderer.
- Existing camera/isolation regression: 67/67.
- Studio TypeScript and changed-file ESLint: PASS after correcting helper type narrowing. No runtime contract change from that correction.
- Actual Chrome WebGPU `actual03`: PASS. Two distinct camera/visibility views, real canvas positive/negative picking at the same pixel, subset Fit, explicit Restore, Section blocking, authored visibility edit + Undo without snapshot resurrection, same-filename Open clearing and one actual native Save download followed by fresh Open with the original document and no session views.
- Product source hashes unchanged throughout actual03. Browser/context/server cleanup confirmed.
- Screenshots and all input data are synthetic.

## Limits and pending
Four real consecutive Apply clicks completed in 138.1 ms with the final camera/subset intact. The actual ViewCube easing intermediate pose was observed before Apply at 109.9 ms; after another 400 ms the snapshot camera and real picking remained correct. Each click target and canvas probe was checked with elementFromPoint. Renderer/device failure, forced CPU renderer, project switch and worker restart are not runtime-qualified. Persistent Save/Open of named views is intentionally unsupported, so #220 is not completed. Native fresh Open checks semantic equality and cannot establish absence of opaque bytes by itself.

The aborted actual01 stopped at browser startup after a fixture-edit path error; it provides no product result. Actual02 and actual03 are separate clean PASS runs; actual03 includes the independently reviewed race extension. No unrelated PDF/golden changes or broad test-suite claims.
