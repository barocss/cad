# D1272 — Propose and approve a tapered variable fillet

2026-11-14 · FEATURE · P5, row 07 · [#2259](https://github.com/barocss/barocss/issues/2259)

The desktop scenario uses the same 12° four-wall Draft Extrude and circular radius law as D1271. The driver makes explicit tool calls through local stdio MCP at autonomy L1. It shares D1271's native reader and Python oracle.

- **PASS, local agent discovery and proposal.** `query.summary` identified body `b1`. `query.native_joints` selected the one edge shared by `n1.side0` and `n1.top`, with native ID `n1_te0` and name `n1.side0|n1.top`. The revision-pinned curvature read returned zero. `describe` disclosed the two interior controls. The agent verified refusal for a direct feature write, a duplicate station and an attempt to accept P1 at L1. The valid proposal reported −19.129 mm³ at MCP's rounded precision and left the part geometry unchanged.
- **PASS, actual desktop Studio.** Opened the proposal from the real MCP-written file. Preview switched the shown mesh from stock to the proposed fillet and displayed −19.13 mm³ (−0.18%). Before and Hide restored the original display. Preview preserved the document and the MCP file. Accept recorded user approval, retained the agent as proposer, and produced the same shown mesh with four radii and both percentages. Undo restored the open proposal and original part. Redo restored the approved result.
- **PASS, native and reopened agreement.** Studio's accepted and reopened volumes were 10553.21467040015 mm³. The independent result was 10553.214670395955 mm³. Strict B-rep, seven circular sections and both connected inclined end trims passed. The reopened native B-rep hash matched the approved result and D1271's direct Studio workflow. A fresh MCP session read the accepted proposal, authored feature and volume 10553.215 mm³ at its reported precision, and preserved the saved bytes. The preview mesh volume was used only to verify which body the viewport showed.
- **PASS, affected checks.** All three browser source files passed the syntax check. The original D1271 desktop flow passed with the shared oracle, including the 8° and 12° states. Four D1272 desktop screenshots were reviewed.
- **FAIL.** None in the recorded delivery checks.
- **NOT_RUN.** Full suites, CI, production build, mobile, natural-language model inference, paid live AI, other autonomy levels and the rest of the open general fillet issue. This delivery changes test and roadmap sources. It leaves the CAD command and approval policies unchanged.

D1273 / P5, row 07 returns to modeling. Start with one open circular native rim whose blend supports are exact. Establish what the existing two-end variable-radius path can build. Add missing admission or geometry only at the first reproduced failure. Qualify the editable Studio feature against independent circular sections and volume.

[Commands and receipt hashes](qualification.json).
