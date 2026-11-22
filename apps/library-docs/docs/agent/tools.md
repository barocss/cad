# Tools (v2 actions)

The agent works through one tool contract, `barocss-cad-tools-v2`. The chat, [`cad-mcp`](/agent/cli) and
[`cad-cli`](/agent/cli) all serve this list and nothing else. It has 13 tools:

- `model`
- `features`
- `query`
- `history`
- `requirements`
- `proposals`
- `assembly`
- `library`
- `print`
- `drawing`
- `subd`
- `image`
- `describe`

## How a call looks

A call names a tool, and its arguments carry an `action`:

```json
{ "name": "query", "arguments": { "action": "measure", "a": "n1.top" } }
```

That is `query.measure`.

- **One action.** A tool with a single action takes it without saying so: `model` with `{ "source": … }` runs a
  script.
- **The handlers.** Each action stands for one of the tool layer's handlers. The call goes through that handler's own
  gates and gives its results and refusals.
- **Naming faces and edges.** Faces and edges are named as the studio names them: `n1.top`, or an edge as two faces,
  `n1.side0|n1.side1`. Selectors work too: `{"feature": 1, "role": "top"}`, `{"normal": [0, 0, 1], "pick": "max"}`.

## `describe`

The list a model reads each turn stays short, and `describe` gives the detail on request:

| Ask | Returns |
|---|---|
| `{}` | Every tool's actions |
| `{"tool"}` | That tool's actions |
| `{"tool", "action"}` | The action's full description and arguments |
| `{"command"}` | A command's selection and values |
| `{"feature"}` | A feature kind's node JSON |

New commands and feature kinds need no change to the list. The `features` tool names them, and `describe` gives their
detail.

For example, the agent mounts a motor with `features.command` and the command `mount`, on a picked face, after
loading the person's mount rows with `features.load_rows` and the kind `mounts`. A mount adds features, so at L1 and L2
it is proposed. See [Part features](/studio/features#machine-elements).

## Results and refusals

- **Data back.** A call returns JSON. A read gives what it read; a change says what it changed.
- **Refusals.** A refused call leaves the part exactly as it was and says why, often with a code the agent can act on.
  For example, `needs_proposal` at L2, or `needs_approval` for a change to the assembly, mates, the drawing, the robot
  or a locked part.
- **A command's refusal.** When the build behind `features.command` refuses, the call returns that refusal as its
  error, as `<Label>: <refusal>`, and the part is left unchanged.
- **Rows.** Rows the agent wrote itself are refused with `[ROWS_NOT_FROM_PERSON]`.
- **All or nothing.** `features.batch` runs several calls all or nothing, and `dryRun` tries them without keeping
  them. `model.run` runs a whole script the same way.

### Use the result for the next call

An accepted part edit returns `ok: true`, `did`, `feature_count`, `facts` and `change`. Use these fields to check what
changed before making another edit. Body details depend on `response_format` and the result's size; an omitted face
list does not mean the body has no faces. Read the part summary before using a face or edge name you have not seen.

To work on the version you reviewed, pass the `revision` from `query.render` or `query.rebuild` as
`expectedRevision` on `features.edit`, `features.command` or `features.delete`. Use the same part scope for both calls.

### Chamfer a sketch corner

Call `query.edit_fields` with the sketch's `index` and `includeSketchCorners: true`. Each
`sketchCorners` entry gives a point in sketch mm and the two saved side IDs that meet there.
Copy the read's `id` into `sketchChamfer.sketch` and its `revision` into `expectedRevision`.
For example, use this as an operation in `proposals.propose` and approve it in Studio.

```json
{
  "tool": "features",
  "args": {
    "action": "edit",
    "index": 0,
    "expectedRevision": "0123456789abcdef",
    "sketchChamfer": { "sketch": "n0", "sides": ["e1", "e2"], "distance": 6 }
  }
}
```

The distance is the setback in mm along each of the two straight sides. This edit supports one
independent material outline with saved side IDs and no holes. The edit is refused if the corner
cannot fit, a constraint or binding would be lost, or the part revision has changed.

### Round a sketch corner

For the same read and approval workflow, send `sketchRound` instead of `sketchChamfer`:

```json
{ "sketchRound": { "sketch": "n0", "sides": ["e1", "e2"], "radius": 6 } }
```

Include the sketch's `index` and `expectedRevision` as above. Round places a tangent circular arc
between two straight sides. Its radius is editable in Studio after approval. The edit refuses a
radius that cannot fit, makes contact with another edge, or would remove a saved constraint or binding.

### Edit several sketch corners together

Use `corners` in place of `sides` to send two or more pairs from the same `query.edit_fields` result.
Keep its sketch ID, feature index and revision in the request. Use one radius or distance in mm for the
whole edit.

```json
{ "sketchRound": { "sketch": "n0", "corners": [["e3", "e4"], ["e4", "e5"]], "radius": 6 } }
```

For a bevel, use `sketchChamfer` with `distance` and the same list of pairs. Stage the full edit as
one operation in `proposals.propose` and approve it in Studio. Each pair must identify a distinct
corner. If any pair fails or the edits consume a shared side, the sketch stays as it was.

If the model has changed, `EDIT_STALE`, `COMMAND_STALE` or `DELETE_STALE` returns the requested and current revisions.
Review the current part before resubmitting. For delete, read the current feature tree to find the new index.
In `features.batch`, the pin applies to the document at the operation's position.

A part-tool refusal returns `ok: false` and `error`; fields such as `code`, `detail` and `kept` appear when the handler
supplies them. Do not assume every tool result has the object API's `code`, `where` and `details` error fields.
Use an available code to select the response, and read the error text for the input to change. For `needs_proposal`
or `needs_approval`, use the proposal workflow. For an invalid selection or value, ask `describe` for the action's
`input` schema or the command's `selection` and `values`, then correct that input. An unknown tool, action, command
or feature request to `describe` returns `error` with the available names; use those names rather than guessing.

These calls come from `samples/agent-mcp.test.mjs`, which runs them through `cad-mcp` on a 60 × 40 × 8 plate:

<<< @/../samples/agent-mcp.test.mjs#l2

At autonomy L3 the same hole applies, and `cad-mcp` saves the file at once:

<<< @/../samples/agent-mcp.test.mjs#l3

## Review a proposal's drawing

Read the working sheet with `drawing.dimensions`. For printed diameter and radius annotations, pass
`include_callouts: true` to get the visible text and the drawing source printed in the title block.

To review an open proposal, read its ID and `proposalRevision` with `proposals.list`. Call `drawing.dimensions`
again with the same `sheet` and a `review` object. Pass the ID as `proposal`, the working sheet's revision as
`expectedRevision`, and the proposal revision as `expectedProposalRevision`.

The result contains the working sheet at the top level and the replayed sheet in `candidate`. Both include their
own source, revision, dimensions and printable callouts. Omit `include_callouts` or set it to `true` during review.
If a proposal reorders the sheets, the candidate reports
the new number of the selected sheet. A removed sheet or a stale proposal returns a refusal. The comparison
leaves the working file and the proposal decision unchanged.

## The per-turn budget

Everything a model reads every turn is held to 25,000 characters at most: the tool list as MCP lists it, and the
system prompt. A test fails if it grows past that, so the detail stays behind `describe`.

## Every action

These tables are generated from the contract's source (`chat/groups.ts`), and the docs check fails if they fall
behind it.

<!--@include: ./_tools.md-->
