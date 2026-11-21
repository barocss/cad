import { DRAFT_EDIT } from '@barocss/cad-model/app/draftEdit';
import type { Active } from './commandState';
import type { ModelNode } from '@barocss/cad-model/engine/doc';
import { CadPartLimits } from '@barocss/cad';
import { isSketchAnchoredCut } from '@barocss/cad-model/app/editFields';
import { smoothLoftHeightKey } from '@barocss/cad-model/app/smoothLoftHeight';
import { smoothTurnAngleKey, smoothTurnAngleLimit, smoothTurnWidthBounds, smoothTurnWidthInvalid, smoothTurnWidthKey } from '@barocss/cad-model/app/smoothLoftTurn';

export type FeatureNumberRule = 'pipe-angle' | 'nonzero' | 'thread-length' | 'nonnegative-mm' | 'nonnegative' | 'positive'
  | 'align-gap' | 'open-unit' | 'smooth-turn-width' | 'draft-angle' | 'scale-factor' | { signedAngleLimit: number };

export function commandNumberRule(command: string, key: string, operation?: unknown): FeatureNumberRule | undefined {
  if (command === 'face-thread') {
    if (key === 'pitch' || key === 'd' || key === 'diameter') return 'positive';
    if (key === 'len') return 'thread-length';
    if (key === 'relief' || key === 'clear') return 'nonnegative-mm';
  }
  if (command === 'pipe' && key === 'bendAngle') return 'pipe-angle';
  if (command === 'keyway' && (key === 'b' || key === 't2')) return 'positive';
  if (command === 'scale' && key === 'factor') return 'scale-factor';
  if ((command === 'draft' || command === DRAFT_EDIT) && key === 'deg') return 'draft-angle';
  if (command === 'align' && key === 'gap') return 'align-gap';
  if (command === 'box' && (key === 'w' || key === 'd')) return 'positive';
  if (command === 'extrude' && key === 'h' && operation === 'cut') return 'positive';
  if ((command === 'box' || command === 'extrude') && key === 'h') return 'nonzero';
  if (command === 'fillet' && key === 'endRadius') return 'nonnegative';
  if (command === 'chamfer' && key === 'distance') return 'positive';
  if (command === 'fillet' && key === 'radius') return 'positive';
  if (command === 'fillet' && (key === 'rho' || key === 'tension')) return 'open-unit';
}

export function historyNumberRule(nodes: readonly ModelNode[], index: number, key: string): FeatureNumberRule | undefined {
  const node = nodes[index];
  if (node?.kind === 'loft' && key === smoothLoftHeightKey) return 'positive';
  if (node?.kind === 'loft' && key === smoothTurnWidthKey) return 'smooth-turn-width';
  if (node?.kind === 'loft' && key === smoothTurnAngleKey) return { signedAngleLimit: smoothTurnAngleLimit(node.sections.length) };
  if (node?.kind === 'sheet-flange' && key === 'ownBendRadius') return 'positive';
  if (node?.kind === 'keyway') return commandNumberRule('keyway', key);
  if (node?.kind === 'face-thread') return commandNumberRule('face-thread', key);
  if (node?.kind === 'scale' && key === 'k') return 'scale-factor';
  if (node?.kind === 'fillet' && ((node.section?.kind === 'conic' && key === 'rho') || (node.section?.kind === 'g2' && key === 'tension'))) return 'open-unit';
  if (node?.kind === 'chamfer' && key === 'd') return 'positive';
  if (node?.kind === 'align' && key === 'gap') return 'align-gap';
  if (node?.kind === 'hole' && node.depth !== undefined && key === 'depth') return 'positive';
  if (key.endsWith('linkedInsetMM')) return 'positive';
  if (node?.kind === 'extrude' && key === 'h') return isSketchAnchoredCut(nodes, index) ? 'positive' : commandNumberRule('extrude', key);
  if (node?.kind === 'extrude' && node.made?.command === 'box') return commandNumberRule('box', key);
  if (node?.kind === 'fillet' && !node.radii?.length && key === 'r') return commandNumberRule('fillet', 'radius');
}

export function featureNumberInvalid(value: string | number, rule: FeatureNumberRule): boolean {
  const number = Number(value);
  if (!Number.isFinite(number)) return true;
  if (typeof rule === 'object') return Math.abs(number) > rule.signedAngleLimit;
  if (rule === 'pipe-angle') return number <= 0 || number > 180;
  if (rule === 'scale-factor') return number <= 0 || number > 1000;
  if (rule === 'draft-angle') return number === 0 || Math.abs(number) >= 45;
  if (rule === 'nonnegative' || rule === 'nonnegative-mm' || rule === 'thread-length') return number < 0;
  if (rule === 'open-unit') return number <= 0 || number >= 1;
  if (rule === 'smooth-turn-width') return smoothTurnWidthInvalid(number);
  if (rule === 'align-gap') return number < 0 || number > CadPartLimits.length;
  return rule === 'positive' ? number <= 0 : number === 0;
}

export function featureNumberRange(rule: FeatureNumberRule): string {
  if (typeof rule === 'object') return `From −${rule.signedAngleLimit}° to +${rule.signedAngleLimit}°`;
  if (rule === 'pipe-angle') return 'Greater than 0° and at most 180°';
  if (rule === 'scale-factor') return 'Unitless factor · greater than 0 and at most 1000';
  if (rule === 'draft-angle') return 'Greater than −45° and less than 45°, excluding 0°';
  if (rule === 'thread-length') return '0 mm or greater · use 0 for the whole face';
  if (rule === 'nonnegative-mm') return '0 mm or greater';
  if (rule === 'nonnegative') return '0 mm or greater · use 0 for the same radius';
  if (rule === 'open-unit') return 'Unitless section shape · greater than 0 and less than 1';
  if (rule === 'smooth-turn-width') return `Greater than ${smoothTurnWidthBounds.min} mm and at most ${smoothTurnWidthBounds.max} mm`;
  if (rule === 'align-gap') return `From 0 to ${CadPartLimits.length} mm`;
  return rule === 'positive' ? 'Greater than 0 mm' : 'Any number except 0 mm';
}

export function featureNumberBounds(rule: FeatureNumberRule | undefined): { min?: number; max?: number } {
  if (typeof rule === 'object') return { min: -rule.signedAngleLimit, max: rule.signedAngleLimit };
  if (rule === 'pipe-angle') return { min: 0, max: 180 };
  if (rule === 'scale-factor') return { min: 0, max: 1000 };
  if (rule === 'draft-angle') return { min: -45, max: 45 };
  if (rule === 'open-unit') return { min: 0, max: 1 };
  if (rule === 'smooth-turn-width') return smoothTurnWidthBounds;
  if (rule === 'align-gap') return { min: 0, max: CadPartLimits.length };
  return rule === 'positive' || rule === 'nonnegative' || rule === 'nonnegative-mm' || rule === 'thread-length' ? { min: 0 } : {};
}

/** Only the active section participates; hidden section drafts are not Apply inputs. */
export function filletSectionNumberProblem(active: Pick<Active, 'cmd' | 'values'>): { key: 'rho' | 'tension'; text: string } | undefined {
  if (active.cmd.id !== 'fillet') return;
  const key = active.values.shape === 'conic' ? 'rho' : active.values.shape === 'g2' ? 'tension' : undefined;
  if (key && featureNumberInvalid(active.values[key], 'open-unit')) return { key, text: featureNumberRange('open-unit') + '.' };
}
