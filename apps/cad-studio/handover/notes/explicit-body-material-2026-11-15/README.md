# Preserve explicit body material selection (#618)

Baseline: `3b364043f4c1f26dac9ff1e5e346eca3c91296ff`.

## Cause and change

SelectionInspector removed the body's material declaration whenever the selected
ID equalled the brief/default material. For a body with no stated brief this
turned an explicit Aluminium choice into assumed material, so the Inspector
showed 2.7 g while engineering requirements correctly remained Unknown.

Keep the explicitly selected ID, including a choice equal to the default or
brief. Do not change the conservative Unknown requirement rule, unstated-body
semantics, inherited brief resolution, shape, colour or schema. There is no new
inheritance/reset UI in this fix.

## Actual verification

- Real Chrome at 1024x1000 and 1440x1000: Steel -> Aluminium declaration survives,
  same-option selection retains it, Undo/Redo restores exact documents, local
  OPFS Save and fresh-context public Open preserve it. Unknown-ID -> Aluminium
  recovery still passes. Unassigned material stays Unknown. Stated Steel brief
  inheritance stays valid; choosing Aluminium then Steel explicitly retains
  both declarations even when matching the brief.
- 20 independent Python arithmetic oracle checks passed for 1000 mm3, Aluminium
  2.7 g/Pass, Steel 7.85 g/Fail and unresolved Unknown. Every document equality
  check includes unchanged nodes, colour and requirements. No browser errors,
  console errors or source-watch changes. Screenshots inspected.
- The same explicit-default assertion failed on the pre-fix QA copy. Its
  SelectionInspector source matched baseline SHA256
  `3aa8a1385cfc35e198d9df5754ddd71c6cba06b9ed0576d7ddb318592622e912`.
- First fixed run reached the brief case but failed on JSON object-key order in
  the inherited helper. Actual output retained material and passed requirements.
  The new driver now compares semantic object equality; the final run passed.
- Existing model material-look/spec-selected tests: 35/35 passed.
- SelectionInspector lint, Studio tsc and Vite production build passed.
- `git diff --check` passed. No #126 WIP file was changed or committed.

Reproduce from apps/cad-studio under the existing heavy gate with PW_DIR and
CHROME configured:

```
EXPLICIT_MATERIAL_SOURCE_FROZEN=1 node test/explicit-body-material-browser.mjs EXTERNAL_OUTPUT --expect=fixed
```

Not run: full suite/CI, multi-body/assembly UI cases, material certification or
native structural analysis. The test uses a single native cube and explicitly
selected library densities; it does not establish whole-family qualification.
