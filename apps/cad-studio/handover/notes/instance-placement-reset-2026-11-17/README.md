# Explicit instance placement reset

Baseline: `d0ea01115622ae7e5ddcb4f4285beee51c693e85`.

Ordinary top-level instance placement previously required six independent scalar edits to return to the assembly origin and zero rotation. Reset placement now performs that explicit change through the existing instance commit path as one Undo step. It preserves all other occurrence properties and the shared definition. It is absent for pattern-controlled occurrences and disabled when already at zero. No new Model API, schema, solver or coordinate convention.

Pointer activation prevents a pending field blur commit before reset; accepted values, not pending inputs, are the history checkpoint. The tooltip explicitly says pending instance input is discarded. Keyboard activation remains supported. This is not a mate solver reset or motion feature.

## Verification

- Helper/SSR3/3: only position/rotation change; exact source/part reference identity and other fields preserved; zero no-op; pattern occurrence no-op and hidden control; zero button disabled.
- Actual Chrome first run PASS: source20×20×10 block placed[15,25,18], rotated[20,-30,45], pending X99; click Reset -> six zeros and literal world bounds[0,0,0] to[20,20,10]. One Undo restores the original six numbers, not99; Redo restores zeros. Three other instances and base/source nodes stay exact.
- Subsequent Y17 Enter and keyboard Enter on reset, Undo/Redo, native Save/fresh Open, disabled reset at origin all pass.
- Actual reset and reopened screens manually reviewed. Reset screen shows all six values and the button; reopen screenshot shows the restored occurrence and position fields, with lower rotation controls below the fold.
- Studio TypeScript, targeted lint and diff checks PASS.

Run from repository root, Node22.19.0:

```sh
node apps/cad-studio/scripts/test.mjs instance-placement-reset
PW_DIR=/Users/user/.cache/barocss-playwright \
CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
INSTANCE_PLACEMENT_RESET_FROZEN=1 \
node apps/cad-studio/test/instance-placement-reset-browser.mjs /private/tmp/cad-placement-reset-new
node node_modules/typescript/bin/tsc --noEmit -p apps/cad-studio/tsconfig.json
```

Limits: actual top-level unmated instance only. Nested instances, solver constraints, pattern seed propagation and neutral exports NOT_RUN. Existing manual placement semantics/HOLD boundaries retained; #178 is not completed by this bounded control.
