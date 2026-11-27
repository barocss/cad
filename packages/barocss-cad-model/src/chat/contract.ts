// The agent tool layer's contract (A5.1, O9): what each tool promises an MCP client beyond its input schema — its
// annotations (read only, destructive, idempotent; nothing reaches outside the document) and, for the tools that only
// read, the shape of their result (`outputSchema`, returned as `structuredContent`). Clients see the handlers through
// the consolidated tools (groups.ts, toolset.ts), whose names, input schemas, annotations and output schemas are frozen
// in `tools-v2.json`; a change that would break a client (a tool or a property gone, a type or enum narrowed, a
// property newly required) needs a new contract version. (O105: the handlers' own 83-tool list, v1, is no longer served.)

import { GROUPS } from './groups';

/** The consolidated tools (A5.3, O11): 13 tools, each action a handler (groups.ts), frozen in `tools-v2.json`; the only surface (O105). */
export const TOOL_CONTRACT_V2 = 'barocss-cad-tools-v2';

export type JsonSchema = { type?: string | string[]; properties?: Record<string, JsonSchema>; required?: string[]; items?: JsonSchema; enum?: unknown[]; additionalProperties?: boolean | JsonSchema; anyOf?: JsonSchema[]; description?: string; [k: string]: unknown };
export interface ToolAnnotations { title: string; readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: false }

const o = (properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema => ({ type: 'object', properties, ...(required.length ? { required } : {}) });
const num: JsonSchema = { type: 'number' }, str: JsonSchema = { type: 'string' }, arr: JsonSchema = { type: 'array' }, obj: JsonSchema = { type: 'object' }, bool: JsonSchema = { type: 'boolean' }, objOrNull: JsonSchema = { type: ['object', 'null'] };

/**
 * The tools that change nothing in the document (the part, its drawing, requirements, proposals, assembly), each with
 * its result's shape where it is fixed. (`checkpoint` keeps a snapshot for the session and `select` sets the viewport
 * selection: neither changes the document.)
 */
const clearanceSchema = (coordinate: 'fraction' | 'time'): JsonSchema => ({ type: ['object', 'null'], properties: { value: num, [coordinate]: num, links: { type: 'array', items: str } }, required: ['value', coordinate, 'links'], additionalProperties: false });
const heldFinishRecovery = {
  ...o({ feature: str, body: str, revision: str, mode: { type: 'string', enum: ['studio_history_review'] }, page: num, pages: num,
    source_body: { type: 'string', description: 'Original body before the held finish.' },
    downstream_feature: { type: 'string', description: 'Feature that follows the held finish on the same body.' },
    independent_body: { type: 'string', description: 'Separate rectangular extrusion preserved during paired Fillet review.' },
    slots: { type: 'array', items: o({ slot: num, authored_edge: str, signature_matches: { type: 'array', items: str, description: 'Tentative matches; each slot still needs an explicit choice.' } },
      ['slot', 'authored_edge', 'signature_matches']) },
    pick_edges: { type: 'array', items: o({ name: str, from: { type: 'array', items: num }, to: { type: 'array', items: num } }, ['name', 'from', 'to']),
      description: 'Eligible viewport picks on this body page, with endpoints in mm. Review and apply in Studio History.' },
  }, ['feature', 'body', 'revision', 'mode', 'page', 'pages', 'slots', 'pick_edges']),
  description: 'Read-only choices for supported held Fillets and Chamfers, including a paired Fillet beside a separate rectangular extrusion. Confirm edge replacements in Studio History.',
};
const versionPin = o({ id: str, snapshot: str, revision: str, evidenceRevision: str }, ['id', 'snapshot', 'revision', 'evidenceRevision']);
const directCandidatePin = o({ proposal: str, proposalRevision: str, baseDirectRevision: str, directRevision: str },
  ['proposal', 'proposalRevision', 'baseDirectRevision']);
const footprint = o({ widthMm: num, depthMm: num }, ['widthMm', 'depthMm']);
const stepIds: JsonSchema = { type: 'array', items: str };
const savedStepState = o({ index: { type: 'integer', minimum: 0 }, step_id: str, installed: stepIds, active: stepIds, waiting: stepIds, unresolved: stepIds, unassigned: stepIds }, ['index', 'step_id', 'installed', 'active', 'waiting', 'unresolved', 'unassigned']);
const savedInstructions = o({ scope: { type: 'string', const: 'saved-top-level-instructions' }, steps: { type: 'array', items: o({ index: { type: 'integer', minimum: 0 }, id: str, name: str, parts: stepIds }, ['index', 'id', 'name', 'parts']) }, unassigned: stepIds, problems: { type: 'array', items: o({ step: str, part: str, kind: { type: 'string', enum: ['missing-part', 'unlistable-part', 'unassigned'] }, message: str }, ['kind', 'message']) }, state: savedStepState }, ['scope', 'steps', 'unassigned', 'problems']);
const drawingRead = { revision: str, sheet: num, sheetName: str, scope: obj, unit: { type: 'string', const: 'mm' }, printUnit: { type: 'string', enum: ['mm', 'inch'] } };
const drawingReadRequired = Object.keys(drawingRead);
const drawingCalloutFields = { source: str, callouts: { type: 'array',
  items: o({ id: str, view: str, kind: { type: 'string', enum: ['diameter', 'radius'] },
    lines: { type: 'array', items: str, minItems: 1 } }, ['id', 'view', 'kind', 'lines']) },
} satisfies Record<string, JsonSchema>;
const nativeJointRead = { body: str, revision: str };
const nativePoint = { type: 'array', items: num, minItems: 3, maxItems: 3 };
const curveSample = o({ parameter: num, magnitude: num, point: nativePoint, vector: nativePoint },
  ['parameter', 'magnitude', 'point', 'vector']);
const READ: Record<string, JsonSchema | null> = {
  list_native_joints: o({ ...nativeJointRead,
    edges: { type: 'array', items: o({ id: str, name: str, faces: { type: 'array', items: str, minItems: 2, maxItems: 2 } }, ['id', 'name', 'faces']) },
  }, ['body', 'revision', 'edges']),
  measure_edge_curvature: o({
    ...nativeJointRead, edgeId: str, edgeName: str, unit: { type: 'string', const: '1/mm' }, minimum: num, maximum: num,
    spans: { type: 'array', items: { type: 'array', items: curveSample } },
  }, ['body', 'revision', 'edgeId', 'edgeName', 'unit', 'minimum', 'maximum', 'spans']),
  measure_edge_continuity: o({ ...nativeJointRead, unit: { type: 'string', const: 'degrees' },
    status: { type: 'string', const: 'measured' }, edgeId: str, edgeName: str,
    faces: { type: 'array', items: o({ id: str, name: str }, ['id']), minItems: 2, maxItems: 2 },
    sampleCount: { type: 'integer', minimum: 1 }, minimumAngleDegrees: num, maximumAngleDegrees: num,
    samples: { type: 'array', items: o({ parameter: num, angleDegrees: num }, ['parameter', 'angleDegrees']) },
    curvature: { oneOf: [
      o({ status: { type: 'string', const: 'measured' }, unit: { type: 'string', const: '1/mm' },
        maximumDifference: { type: 'number', minimum: 0 },
        samples: { type: 'array', items: o({ parameter: num, first: num, second: num, difference: { type: 'number', minimum: 0 } },
          ['parameter', 'first', 'second', 'difference']) },
      }, ['status', 'unit', 'maximumDifference', 'samples']),
      o({ status: { type: 'string', const: 'unavailable' }, reason: { type: 'string', enum: ['non-tangent', 'derivative-unavailable'] } }, ['status', 'reason']),
    ] },
  }, ['body', 'revision', 'unit', 'status', 'edgeId', 'faces', 'sampleCount', 'minimumAngleDegrees', 'maximumAngleDegrees', 'samples']),
  get_drawing_dimensions: o({ ...drawingRead, dimensions: arr, ...drawingCalloutFields,
    candidate: o({ ...drawingRead, dimensions: arr, ...drawingCalloutFields, proposal: str, proposalRevision: str },
      [...drawingReadRequired, 'dimensions', 'source', 'callouts', 'proposal', 'proposalRevision']),
  }, [...drawingReadRequired, 'dimensions']),
  calculate_drawing_tolerance_stack: o({ ...drawingRead, method: { type: 'string', const: 'worst-case' }, nominal: str, minimum: str, maximum: str, terms: arr },
    [...drawingReadRequired, 'method', 'nominal', 'minimum', 'maximum', 'terms']),
  output_bom: o({ revision: str, files: arr }, ['revision', 'files']),
  output_requirement_evidence: o({ revision: str, files: arr }, ['revision', 'files']),
  inspect_local_task_plan: o({ revision: str, status: { type: 'string', enum: ['ready', 'blocked'] },
    occurrences: { type: 'array', items: str },
    tasks: { type: 'array', items: o({ occurrence: str, feature: str, field: { type: 'string', enum: ['height', 'width', 'depth', 'diameter', 'footprint'] } }, ['occurrence', 'feature', 'field']) },
    targets: { type: 'array', items: { oneOf: [
      o({ id: str, requirementId: str, currentHeightMm: num, heightMm: num, toleranceMm: num },
        ['id', 'requirementId', 'currentHeightMm', 'heightMm', 'toleranceMm']),
      o({ id: str, requirementId: str, currentWidthMm: num, widthMm: num, toleranceMm: num, retainBoxCommand: { type: 'boolean', const: true } },
        ['id', 'requirementId', 'currentWidthMm', 'widthMm', 'toleranceMm']),
      o({ id: str, requirementId: str, currentDepthMm: num, depthMm: num, toleranceMm: num, retainBoxCommand: { type: 'boolean', const: true } },
        ['id', 'requirementId', 'currentDepthMm', 'depthMm', 'toleranceMm']),
      o({ id: str, requirementId: str, currentDiameterMm: num, diameterMm: num, toleranceMm: num },
        ['id', 'requirementId', 'currentDiameterMm', 'diameterMm', 'toleranceMm']),
      o({ id: str, currentFootprintMm: footprint, footprintMm: footprint,
        widthRequirementId: str, depthRequirementId: str, widthToleranceMm: num, depthToleranceMm: num },
      ['id', 'currentFootprintMm', 'footprintMm', 'widthRequirementId', 'depthRequirementId', 'widthToleranceMm', 'depthToleranceMm']),
    ] } },
    issues: { type: 'array', items: o({ code: str, message: str, occurrence: str, inputs: { type: 'array', items: str } }, ['code', 'message']) },
  }, ['revision', 'status', 'occurrences', 'tasks', 'targets', 'issues']),
  output_purchase_csv: o({ revision: str, files: arr }, ['revision', 'files']),
  output_clearance: o({ revision: str, files: arr }, ['revision', 'files']),
  output_cam_package: o({ revision: str, files: arr }, ['revision', 'files']),
  output_print_layers: o({ revision: str, files: arr }, ['revision', 'files']),
  output_bundle: o({ revision: str, files: arr }, ['revision', 'files']),
  get_part_summary: o({ feature_count: num, facts: obj, parameters: obj, features: arr, bodies: arr, held_finish_recovery: heldFinishRecovery, direct_curves: arr, direct_surfaces: arr, direct_revision: str, note: str, followed_changed: arr, variability: obj }, ['feature_count', 'facts', 'parameters', 'features', 'bodies']),
  get_image_layers: null,
  measure_photo_pair: o({
    calibration: o({ name: str, diameterMM: num, frontMMPerPixel: num, sideMMPerPixel: num, registrationToleranceMM: num },
      ['name', 'diameterMM', 'frontMMPerPixel', 'sideMMPerPixel', 'registrationToleranceMM']),
    parts: { type: 'array', items: o({ name: str, frontLayer: str, sideLayer: { type: ['string', 'null'] }, widthMM: num, heightMM: num,
      depthMM: { type: ['number', 'null'] }, topFromReferenceMM: num, widthEvidence: str, heightEvidence: str, depthEvidence: str },
      ['name', 'frontLayer', 'sideLayer', 'widthMM', 'heightMM', 'depthMM', 'topFromReferenceMM', 'widthEvidence', 'heightEvidence', 'depthEvidence']) },
    evidence: o({ frontImage: num, sideImage: num, traceRevision: str }, ['frontImage', 'sideImage', 'traceRevision']),
    unknown: { type: 'array', items: str },
  }, ['calibration', 'parts', 'evidence', 'unknown']),
  measure: o({ label: str, area: num, length: num, radius: num, distance: num, from: arr, to: arr, angle: num, normalDistance: num, resolved: arr }),
  mass_properties: o({ bodies: arr, note: str }, ['bodies']),
  interference: o({ pairs: arr, note: str }, ['pairs']),
  section: o({ axis: str, at: num, cut: arr }, ['axis', 'at', 'cut']),
  wall_thickness: o({ body: str, thinnest: num, at: arr, face: str, note: str }, ['body']),
  draft: o({ body: str, pull: arr, walls: arr, under_min: arr, note: str }, ['body', 'walls']),
  check_spec: { type: 'object', oneOf: [
    o({ model_hash: str, summary: obj, failures: arr, unknowns: arr, policy: obj, validation: obj }, ['model_hash', 'summary']),
    o({ revision: str, evidenceRevision: str, candidate: directCandidatePin, requirement: str, expected: str, unit: { type: 'string', const: 'mm' },
      status: { type: 'string', enum: ['pass', 'fail', 'unknown'] }, measured: num, delta: num, entities: arr, why: str, hint: str },
    ['revision', 'evidenceRevision', 'candidate', 'requirement', 'expected', 'unit', 'status']),
  ] },
  // (FR4a, D127: a frame's cut list.)
  cut_list: o({ rows: arr, totals: obj, densities: str, nesting: obj, csv: str }, ['rows', 'totals', 'densities', 'nesting']),
  // (D155: a hole–shaft fit.)
  fit_clearance: o({ kind: str, clearanceMin: num, clearanceMax: num, estimate: bool, hole: obj, shaft: obj, offset: num, length: num, margin: num, mmc: obj, lmc: obj, contradicted: bool, message: str }, ['kind', 'clearanceMin', 'clearanceMax', 'estimate', 'hole', 'shaft']),
  // (FRd1, O118: a frame's welds.)
  weld_list: o({ joints: arr, totals: obj, orphaned: arr, notes: arr }, ['joints', 'totals', 'orphaned', 'notes']),
  list_feature_edit_fields: o({ index: { type: 'integer', minimum: 0 }, id: str, label: str, revision: str, fields: { type: 'array',
    items: o({ key: str, label: str, kind: { type: 'string', enum: ['number', 'choice', 'toggle'] }, value: { type: ['number', 'string', 'boolean', 'null'] },
      unit: str, options: { type: 'array', items: o({ value: str, label: str }, ['value', 'label']) }, parameter: str,
      integerRange: o({ min: num, max: num }, ['min', 'max']) }, ['key', 'label', 'kind', 'value']) },
    sketchCorners: { type: 'array', items: o({ point: { type: 'array', items: num, minItems: 2, maxItems: 2 },
      sides: { type: 'array', items: str, minItems: 2, maxItems: 2 } }, ['point', 'sides']) },
    sketchChamfers: { type: 'array', items: o({ bevel: str, distance: num }, ['bevel', 'distance']) },
    sketchFillets: { type: 'array', items: o({ fillet: str, radius: num }, ['fillet', 'radius']) },
  }, ['index', 'id', 'label', 'revision', 'fields']),
  rebuild_report: o({ revision: str, evaluation: num, basis: str, evaluationTime: num, features: arr, built: num, builtTime: num, slowest: { type: ['string', 'null'] }, reused: num, mates: arr, loops: arr, limits: str }, ['revision', 'basis', 'evaluationTime', 'features', 'built', 'builtTime', 'slowest', 'reused', 'mates', 'loops', 'limits']),
  diff: o({ from: str, to: str, diff: obj }, ['diff']),
  list_proposals: o({ proposals: arr }, ['proposals']),
  render_views: o({ revision: str, imageSha256: str, legend: obj, views: obj, layout: str, notes: arr,
    directObjects: { type: 'array', items: o({ id: str, name: str, kind: { type: 'string', enum: ['curve', 'surface'] } }, ['id', 'name', 'kind']) },
    candidate: directCandidatePin },
  ['views', 'revision', 'imageSha256']),
  inspect: o({ faces: arr, edges: arr, revision: str, unit: { type: 'string', const: 'mm' }, candidate: directCandidatePin,
    curveJoin: o({ curveId: str, parameter: num, point: nativePoint, angleDegrees: num, unit: { type: 'string', const: 'degrees' }, revision: str },
    ['curveId', 'parameter', 'point', 'angleDegrees', 'unit', 'revision']),
    surfacePoint: o({ surfaceId: str, u: num, v: num, point: nativePoint, normal: nativePoint, unit: { type: 'string', const: 'mm' }, revision: str },
      ['surfaceId', 'u', 'v', 'point', 'normal', 'unit', 'revision']),
    guidedFill: o({
      surfaceId: str, sources: o({ seam: str, first: str, second: str, guide: str, donor: str }, ['seam', 'first', 'second', 'guide', 'donor']),
      boundaryMaximumGapMM: num, guideMaximumGapMM: num, seamNormalAngleBoundDegrees: num, sampleCount: num,
      topology: o({ kind: { type: 'string', const: 'sheet' }, closed: { type: 'boolean', const: false },
        faceCount: num, edgeCount: num, openEdges: num }, ['kind', 'closed', 'faceCount', 'edgeCount', 'openEdges']),
      revision: str,
    }, ['surfaceId', 'sources', 'boundaryMaximumGapMM', 'guideMaximumGapMM', 'seamNormalAngleBoundDegrees', 'sampleCount', 'topology', 'revision']) }),
  select: o({ ok: bool, selected: obj }, ['ok']),
  checkpoint: o({ ok: bool, checkpoint: str, model_hash: str, checkpoints: arr }, ['ok', 'checkpoint']),
  // (CG6, DA-8: a version and a branch change the version log, not the document, as a checkpoint keeps a snapshot.)
  make_version: o({ ok: bool, version: obj, branch: str, count: num }, ['ok', 'version', 'branch', 'count']),
  make_branch: o({ ok: bool, branch: str, from: str, current: str }, ['ok', 'branch', 'from', 'current']),
  list_versions: o({ current: { type: ['string', 'null'] }, branches: arr, versions: arr, note: str }, ['current', 'branches', 'versions']),
  compare_versions: o({ from: str, to: str, same: bool, features: arr, parameters: arr, configurations: arr, mates: arr, instances: arr, fields: arr }, ['from', 'to', 'same', 'features', 'parameters', 'configurations', 'mates', 'instances', 'fields']),
  approved_requirement_evidence: o({ from: versionPin, to: versionPin, part: str, proposal: str, files: arr }, ['from', 'to', 'part', 'proposal', 'files']),
  subd_cage: o({ ok: bool, index: num, vertices: num, faces: num, creases: num, bounds: obj, validation: obj, cageRevision: str }, ['ok', 'index']),
  subd_select: o({ ok: bool, faces: arr, vertices: arr, edges: arr, count: num, cageRevision: str }, ['ok']),
  drawing_issues: o({ sheet: obj, issues: arr }, ['sheet', 'issues']),
  tolerance_suggestions: o({ mode: str, suggestions: arr }, ['mode', 'suggestions']),
  get_assembly: o({ base: obj, instances: arr, mates: arr, note: str, assembly_steps: savedInstructions }, ['base']),
  list_library: o({ libraries: arr, note: str }, ['libraries']),
  check_printability: o({ direction: { type: ['object', 'null'] }, rules: arr }, ['rules']),
  link_inertia: o({ links: arr }, ['links']),
  motion_torques: o({ profile: str, duration: num, joints: obj, sampling: str, gravity: num }, ['profile', 'duration', 'joints', 'sampling']),
  size_actuators: o({ profile: str, moveDuration: num, cycleDuration: num, joints: arr, skipped: arr, model: str, sampling: str, pending_worked_examples: arr }, ['profile', 'moveDuration', 'cycleDuration', 'joints', 'skipped', 'model', 'sampling', 'pending_worked_examples']),
  get_brief: o({ brief: objOrNull, gaps: arr, complete: bool, unverified: arr, asked: obj, process: objOrNull, material: objOrNull }, ['brief', 'gaps', 'complete', 'unverified', 'asked', 'process', 'material']),
  get_references: o({ references: arr, datums: arr, keepouts: arr, problems: arr }, ['references', 'datums', 'keepouts']),
  standards_lookup: o({ tables: arr, table: str, row: str, unit: str, standards: arr, values: obj, sources: obj }),
  get_drafts: o({ drafts: arr, unconfirmed: arr, assumptions: arr, note: str }, ['drafts', 'unconfirmed', 'assumptions', 'note']),
  check_keepouts: o({ results: arr, clear: num, violated: num, undecided: num }, ['results', 'clear', 'violated', 'undecided']),
  gravity_torques: o({ torques: obj, generalized: obj, units: obj, gravity: num, notReady: obj }, ['torques', 'generalized', 'units', 'gravity']),
  sweep_path: o({ clear: bool, contact: obj, exhausted: obj, minClearance: clearanceSchema('fraction'), samples: num, pairs: num, skipped: arr, designed: arr }, ['clear', 'samples', 'pairs', 'skipped', 'designed']),
  export_mjcf: o({ mjcf: str, files: arr, notes: arr, check: arr }, ['mjcf', 'files', 'notes', 'check']),
  export_urdf: o({ urdf: str, files: arr, notes: arr, check: arr }, ['urdf', 'files', 'notes', 'check']),
  set_pose: o({ values: obj, links: arr, frames: arr, gears: arr, out_of_limits: arr }, ['values', 'links', 'gears', 'out_of_limits']),
  check_path: o({ motion: str, duration: num, clear: bool, contact: obj, exhausted: obj, minClearance: clearanceSchema('time'), samples: num, skipped: arr, designed: arr }, ['motion', 'duration', 'clear', 'minClearance', 'samples', 'skipped', 'designed']),
  play_motion: o({ motion: str, duration: num, samples: arr }, ['motion', 'duration', 'samples']),
  forward_kinematics: o({ values: obj, links: arr, frames: arr, gears: arr, out_of_limits: arr }, ['values', 'links', 'gears', 'out_of_limits']),
  get_joints: o({ version: num, base: str, links: arr, joints: arr, loops: arr, couplings: arr, problems: arr, notes: arr, frames: arr }, ['version', 'base', 'links', 'joints', 'loops', 'couplings', 'problems', 'notes']),
};
/** Changes that only add (a feature, a part, a mate, a proposal, a library): nothing there before is altered. */
const ADDS = new Set(['add_assembly_step', 'run_command', 'add_features', 'extrude_image_layer', 'inflate_image_layer', 'add_part', 'add_mate', 'pattern_part', 'insert_part', 'add_library', 'add_library_part', 'propose', 'propose_photo_pair']);
/** Changes that may alter or remove what is there; `true`: the same call twice has no further effect. */
const ALTERS: Record<string, boolean> = {
  load_rows: true, edit_feature: true, delete_feature: true, apply_ops: false, run_script: false, restore: true, restore_best: true, set_requirements: true, set_brief: true, set_material: true, set_stock: true, set_casting: true, set_frame_stock: true, set_parameters: false, set_frame_sections: true, set_welds: true, ask_user: false, add_reference: false, add_datum: false, add_keepout: false, delete_reference_item: true, import_drawing: false, accept_proposal: true,
  subd_move: false, subd_scale: false, subd_rotate: false, subd_extrude: false, subd_insert_loop: false, subd_bridge: false, subd_fill: false, subd_weld: false, subd_crease: true, subd_delete: false,
  place_part: true, delete_part: true, edit_pattern: true, delete_pattern: true, cut_parts: false, edit_mate: true, lock_part: false, delete_mate: true, snap_part: true, orient_for_print: true,
  restore_version: true, switch_branch: true, merge_branch: true,
  auto_dimension: true, fix_drawing: false, accept_tolerances: false, set_drawing: true, set_joints: true, set_inputs: true, set_variants: true, set_frames: true, set_waypoint: false,
};

const titleOf = (name: string) => name.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());

/** A tool's annotations; throws for a tool the contract does not classify (each new tool must be). */
export function annotationsOf(name: string): ToolAnnotations {
  // (A consolidated tool: read only if every action is, destructive if any is, idempotent if all are; describe reads.)
  if (name === 'describe') return { title: GROUPS.describe.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  if (name in GROUPS) {
    const each = Object.values(GROUPS[name].actions).map(([v1]) => annotationsOf(v1));
    return { title: GROUPS[name].title, readOnlyHint: each.every(a => a.readOnlyHint), destructiveHint: each.some(a => a.destructiveHint), idempotentHint: each.every(a => a.idempotentHint), openWorldHint: false };
  }
  if (name in READ) return { title: titleOf(name), readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  if (ADDS.has(name)) return { title: titleOf(name), readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
  if (name in ALTERS) return { title: titleOf(name), readOnlyHint: false, destructiveHint: true, idempotentHint: ALTERS[name], openWorldHint: false };
  throw new Error(`The tool contract does not classify "${name}": add it to READ, ADDS or ALTERS in src/chat/contract.ts.`);
}
/** A read tool's result shape (undefined: the tool changes the document, or its result has no fixed shape). */
export const outputSchemaOf = (name: string): JsonSchema | undefined => READ[name] ?? undefined;

/** Problems of a value against a schema (type, required, properties, items, enum); empty when it conforms. */
/** The keywords `validate` evaluates; any other (pattern, minLength, anyOf, if/then ...) is ignored, so it must not decide a oneOf. */
const EVALUATED = new Set(['type', 'properties', 'required', 'items', 'enum', 'const', 'not', 'additionalProperties', 'minimum', 'maximum', 'exclusiveMinimum', 'oneOf', 'description', 'title']);
function evaluated(schema: unknown): boolean {
  if (!schema || typeof schema !== 'object') return true;
  const s = schema as JsonSchema;
  if (Object.keys(s).some(k => !EVALUATED.has(k)) || (s.additionalProperties !== undefined && s.additionalProperties !== false)) return false;
  return Object.values(s.properties ?? {}).every(evaluated) && (s.items === undefined || evaluated(s.items)) && (s.not === undefined || evaluated(s.not)) && (!Array.isArray(s.oneOf) || (s.oneOf as unknown[]).every(evaluated));
}
export function validate(schema: JsonSchema, value: unknown, at = '$'): string[] {
  const out: string[] = [];
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const kind = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value === 'number' && Number.isInteger(value) && types.includes('integer') ? 'integer' : typeof value;
    if (!types.includes(kind) && !(kind === 'integer' && types.includes('number'))) return [`${at}: ${kind}, not ${types.join(' | ')}`];
  }
  if (schema.enum && !schema.enum.some(e => JSON.stringify(e) === JSON.stringify(value))) out.push(`${at}: not one of ${JSON.stringify(schema.enum)}`);
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) out.push(`${at}: below ${schema.minimum}`);
    if (typeof schema.maximum === 'number' && value > schema.maximum) out.push(`${at}: above ${schema.maximum}`);
    if (typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum) out.push(`${at}: not above ${schema.exclusiveMinimum}`);
  }
  if ('const' in schema && JSON.stringify(schema.const) !== JSON.stringify(value)) out.push(`${at}: not ${JSON.stringify(schema.const)}`);
  if (schema.not && typeof schema.not === 'object' && !validate(schema.not as JsonSchema, value, at).length) out.push(`${at}: matches a form it must not`);
  // (oneOf is checked only when every form uses keywords this validator evaluates; else a form that matches too much would give a false "matches 2".)
  if (Array.isArray(schema.oneOf) && (schema.oneOf as JsonSchema[]).every(evaluated)) { const fits = (schema.oneOf as JsonSchema[]).filter(s => !validate(s, value, at).length).length; if (fits !== 1) out.push(`${at}: matches ${fits} of the ${schema.oneOf.length} forms, not exactly one`); }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const rec = value as Record<string, unknown>;
    for (const k of schema.required ?? []) if (!(k in rec)) out.push(`${at}.${k}: missing`);
    for (const [k, sub] of Object.entries(schema.properties ?? {})) if (k in rec) out.push(...validate(sub, rec[k], `${at}.${k}`));
    if (schema.additionalProperties === false) for (const k of Object.keys(rec)) if (!(k in (schema.properties ?? {}))) out.push(`${at}.${k}: not allowed`);
  }
  if (Array.isArray(value) && schema.items) value.forEach((x, i) => out.push(...validate(schema.items!, x, `${at}[${i}]`)));
  return out;
}

/** A schema without its descriptions (wording may change freely; the shape may not). */
export function shapeOf(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(shapeOf);
  if (!schema || typeof schema !== 'object') return schema;
  return Object.fromEntries(Object.entries(schema as Record<string, unknown>).filter(([k]) => k !== 'description').sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, k === 'properties' ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a < b ? -1 : 1).map(([p, s]) => [p, shapeOf(s)])) : shapeOf(v)]));
}

/** One tool as the contract freezes it. */
export interface ContractEntry { name: string; annotations: ToolAnnotations; input: unknown; output?: unknown }
export function contractOf(tools: readonly { name: string; input_schema: unknown }[]): ContractEntry[] {
  return tools.map(t => { const out = outputSchemaOf(t.name); return { name: t.name, annotations: annotationsOf(t.name), input: shapeOf(t.input_schema), ...(out ? { output: shapeOf(out) } : {}) }; }).sort((a, b) => a.name < b.name ? -1 : 1);
}

/**
 * What would break a client of `before` in `after`: a tool gone, an input property gone, a type or enum narrowed, a
 * property newly required, a read-only tool that now changes things; an output property gone or no longer required,
 * its type changed. (Additions, new optional properties and wider enums are compatible.)
 */
export function breakingChanges(before: readonly ContractEntry[], after: readonly ContractEntry[]): string[] {
  const out: string[] = [], now = new Map(after.map(e => [e.name, e]));
  for (const b of before) {
    const a = now.get(b.name);
    if (!a) { out.push(`${b.name}: removed`); continue; }
    if (b.annotations.readOnlyHint && !a.annotations.readOnlyHint) out.push(`${b.name}: no longer read only`);
    if (!b.annotations.destructiveHint && a.annotations.destructiveHint) out.push(`${b.name}: now destructive`);
    out.push(...narrowed(b.input as JsonSchema, a.input as JsonSchema, `${b.name} input`, 'input'));
    if (b.output) out.push(...(a.output ? narrowed(b.output as JsonSchema, a.output as JsonSchema, `${b.name} output`, 'output') : [`${b.name}: output schema removed`]));
  }
  return out;
}
function narrowed(b: JsonSchema, a: JsonSchema, at: string, side: 'input' | 'output'): string[] {
  const out: string[] = [];
  if (JSON.stringify(b.type) !== JSON.stringify(a.type) && b.type !== undefined) out.push(`${at}: type ${JSON.stringify(b.type)} → ${JSON.stringify(a.type)}`);
  if (b.enum && a.enum && b.enum.some(v => !a.enum!.some(w => JSON.stringify(w) === JSON.stringify(v)))) out.push(`${at}: enum narrowed`);
  if (!b.enum && a.enum && side === 'input') out.push(`${at}: enum added`);
  const bp = b.properties ?? {}, ap = a.properties ?? {};
  for (const k of Object.keys(bp)) {
    if (!(k in ap)) { out.push(`${at}.${k}: removed`); continue; }
    out.push(...narrowed(bp[k], ap[k], `${at}.${k}`, side));
  }
  if (side === 'input') for (const k of a.required ?? []) if (!(b.required ?? []).includes(k)) out.push(`${at}.${k}: newly required`);
  if (side === 'output') for (const k of b.required ?? []) if (!(a.required ?? []).includes(k)) out.push(`${at}.${k}: no longer required`);
  if (b.items && a.items) out.push(...narrowed(b.items, a.items, `${at}[]`, side));
  return out;
}
