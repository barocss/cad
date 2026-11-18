# #710 — retained Variant occurrence identity

Baseline main b8bc69790. Actual Studio Remove deletes Original pin inst1 but retains its Height input and Tall variant. Missing target correctly raises INPUT_TARGET. Duplicating Spare pin then reuses inst1: Tall silently grows Spare pin copy from h20/2000 mm³ to h35/3500 mm³. This is a different part, not a restored original. Public delete_part/add_part(copy_of) independently reproduces p1 recapture.

The common new-instance allocator now reserves the current document's parameter/suppress part, component instance, and component like source references. It does not traverse child/pending namespaces, interpret library or mate identifiers as instances, rename existing IDs, or remove missing bindings. Existing allocations without retained references remain unchanged.

Fixed actual UI assigns inst3 to the duplicate. Show Tall retains the missing inst1 diagnostic, both spare occurrences stay h20, and no document mutation is made by the rejected variant. Undo twice restores the original part and its valid Tall input; Redo restores the safe missing state. Native Save and fresh Open retain the exact diagnostic and binding data. Frozen source changes=[]; contexts/browser/server cleanup confirmed in both runs.

Focused and existing identity/Variant regressions: 29/29. Includes parameter, suppress, component target/source, local namespace isolation, native roundtrip and restoration. Model/Studio types and lint are reported on the issue. Appearance/Gizmo and deletion policy are unchanged.
