# D1503 — Cancel a held local SubD turn when its pointer or source changes

P5, row 08, [#625](https://github.com/barocss/cad/issues/625). Base `cfe20575bc28de49429bc702b53cb25d88393eff`. This desktop regression changes no product source.

## Verification

- **PASS, actual desktop Studio.** Press and drag the Face normal handle to +15° on one tilted quad about guarded vertex 93. An injected browser `pointercancel` discards the draft, as does calling the browser's native `releasePointerCapture` with the captured pointer ID. The later mouse-up in both cases leaves the original cage, selection, history and document intact.
- **PASS, selection replacement.** Press 2 while the arc is held. Edge mode clears the face selection and cancels the turn. Late release leaves the same cage and undo depth. Select the original face again and turn it normally. The +15° turn matches independent coordinates within 1e-10 mm and adds one step.
- **PASS, native document replacement.** Start a new turn and open a different native one-SubD file before releasing the mouse. The incoming document retains its exact authored cage after late mouse-up, with no old cage session. Save and fresh Open retain that replacement exactly.
- **PASS, regression.** 26 Studio tests, browser syntax and Git diff checks. Run the uninterrupted Face normal pivot flow without the ownership flag as a control. Its accepted drag, history and native reopen still pass.
- **NOT_RUN.** Physical hardware interruption, other native replacement inputs, alternate renderers, mobile and full local suites. No production type/build rerun for this test-only change. #625 remains open until the body transform control and acceptance review.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Run heavy commands through the gate. Freeze worktree writes during Studio and keep evidence outside Git.

```sh
node apps/cad-studio/scripts/test.mjs cage-transform-draft gizmo gizmo-state-presentation
node --check apps/cad-studio/test/cage-local-rotation-browser.mjs
git diff --check
cd apps/cad-studio
export CAGE_LOCAL_ROTATION_SOURCE_FROZEN=1
node test/cage-local-rotation-browser.mjs "$EVIDENCE/ownership" --face-pivot --ownership
node test/cage-local-rotation-browser.mjs "$EVIDENCE/control" --face-pivot
```
