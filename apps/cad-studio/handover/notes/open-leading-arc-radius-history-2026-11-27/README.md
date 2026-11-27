# D2045: Undo a numeric radius edit when the arc starts an open outline

P1, [#21](https://github.com/barocss/cad/issues/21). On public base `23e95d83a51caa5544f5caa9630ac77db4fc061b`, desktop Chrome could author an open Arc–Line–Line and change the leading arc from R12.5 to R15, but Undo did not restore R12.5. Studio now records that radius edit for one ordinary unconstrained four-point open outline. The three- and five-point rules, reference ownership checks, solver, and file format are unchanged.

## Acceptance

- Start with Arc, add two Lines, then type R15. Undo and Redo restore R12.5 and R15 without moving any of the four points or modifying the committed document. Impossible R9 preserves the prior arc and Redo.
- Close the outline explicitly and extrude 3 mm. The native shape is one strict solid, with an R15 cylinder at approximately (20, 18.819660) mm and volume 1357.15597008528 mm³ (independent circular-segment volume: 1357.15597132823 mm³). Check the result again after Undo/Redo and Save/fresh Open. No other multi-arc, linked, constrained, or preexisting outline is admitted by this change.
- 17 focused Studio tests and the CI-pinned Studio TypeScript 5.9.2 check. The existing five-point Line–Arc–Line–Arc flow is the desktop control.

[Prior](studio/00-prior.png) · [Undo](studio/01-undo.png) · [Redo](studio/02-redo.png) · [Fresh Open](studio/05-fresh-open.png)

```sh
pnpm -C apps/cad-studio test open-terminal-arc-radius-history open-arc-radius-history draft-history
pnpm -C apps/cad-studio type-check
export D2045_SOURCE_FROZEN=1 D2039_SOURCE_FROZEN=1 PW_DIR=/path/to/playwright CHROME=/path/to/chrome
node apps/cad-studio/test/open-leading-arc-radius-history-browser.mjs /tmp/leading-fixed
node apps/cad-studio/test/open-two-arc-radius-history-browser.mjs /tmp/leading-control
# On the previous product SHA, with the new test copied in, use --baseline.
```
