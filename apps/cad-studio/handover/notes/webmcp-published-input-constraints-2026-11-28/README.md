# D2207 — Publish the validated WebMCP input constraints

P1 [row 04](../../roadmap-rows/04.md) and [row 16](../../roadmap-rows/16.md) · [#204](https://github.com/barocss/cad/issues/204) · Base `b72978155ffde4727caa205b729b33c4d43303e9`.

The published schemas now describe the same minimum dimensions, maximum CAD length, body key length and revision format that the runtime checks. A literal Extrude accepts a positive distance. A standard saved Box or Cylinder requires at least 1 mm. On an authored Cylinder, the Hole schema publishes the outside diameter as an exclusive limit under the current grant. The source, membership and revision checks still run on each call.

- **FAIL, original catalogue.** Chrome discovered the expected six tools and their required fields. The published metadata omitted the minimum dimensions, the Cylinder-specific Hole limit, the revision pattern and the non-empty body key, even though runtime rejected the corresponding values.
- **PASS, actual catalogue.** Chrome 158.0.8127.89 exposed the Box minimum of 1 mm, Cylinder radius minimum of 0.5 mm, literal Extrude exclusive minimum of 0 mm, standard Cylinder Extrude minimum of 1 mm, and Hole minimum of 0.5 mm. Replacing an R5 Cylinder with R6 changed the Hole's exclusive maximum from 10 to 12 mm. The preceding revision was refused. Reopening R5 restored 10 mm.
- **PASS, admission and local registry.** 26 malformed, out-of-scope or stale calls failed, including non-finite numbers, absent and extra properties, incorrect body keys, a revision with a trailing newline and a bore that consumed the entire Cylinder. Actual stdio MCP listed `query`, `features` and `proposals`; the supported browser reads agreed at 40,000 mm³ and 10 mm. The browser document and the stdio file retained their original content through the read and refusal checks.
- **PASS, Studio.** The Ø4 mm positive case required user approval and produced 659.734 mm³. Undo and Redo passed. The checked-in summary and Hole drivers passed, including the revision contract and the approved Hole after project reopen. 18 Studio tests, 5 Model tests, Studio and Model type-checks, scoped lint and whitespace passed.
- **NOT_RUN.** Non-JSON inherited-property injection, full local suites, module-level hot replacement, external natural-language agent clients, paid live qualification and mobile. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
bash "$OUT/run.sh" desktop-before --baseline
bash "$OUT/verify.sh"
git diff --check
```
