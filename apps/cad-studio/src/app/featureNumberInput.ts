import type { Active } from './commandState';
import type { ModelNode } from '@barocss/cad-model/engine/doc';
import { CadPartLimits } from '@barocss/cad';
import { isSketchAnchoredCut } from '@barocss/cad-model/app/editFields';

export type FeatureNumberRule = 'nonzero' | 'positive' | 'align-gap' | 'open-unit';

export function commandNumberRule(command: string, key: string, operation?: unknown): FeatureNumberRule | undefined {
  if (command === 'align' && key === 'gap') return 'align-gap';
  if (command === 'box' && (key === 'w' || key === 'd')) return 'positive';
  if (command === 'extrude' && key === 'h' && operation === 'cut') return 'positive';
  if ((command === 'box' || command === 'extrude') && key === 'h') return 'nonzero';
  if (command === 'fillet' && key === 'radius') return 'positive';
  if (command === 'fillet' && (key === 'rho' || key === 'tension')) return 'open-unit';
}

export function historyNumberRule(nodes: readonly ModelNode[], index: number, key: string): FeatureNumberRule | undefined {
  const node = nodes[index];
  if (node?.kind === 'fillet' && ((node.section?.kind === 'conic' && key === 'rho') || (node.section?.kind === 'g2' && key === 'tension'))) return 'open-unit';
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
  if (rule === 'open-unit') return number <= 0 || number >= 1;
  if (rule === 'align-gap') return number < 0 || number > CadPartLimits.length;
  return rule === 'positive' ? number <= 0 : number === 0;
}

export function featureNumberRange(rule: FeatureNumberRule): string {
  if (rule === 'open-unit') return 'Unitless section shape · greater than 0 and less than 1';
  if (rule === 'align-gap') return `From 0 to ${CadPartLimits.length} mm`;
  return rule === 'positive' ? 'Greater than 0 mm' : 'Any number except 0 mm';
}

export function featureNumberBounds(rule: FeatureNumberRule | undefined): { min?: number; max?: number } {
  if (rule === 'open-unit') return { min: 0, max: 1 };
  if (rule === 'align-gap') return { min: 0, max: CadPartLimits.length };
  return rule === 'positive' ? { min: 0 } : {};
}

/** Only the active section participates; hidden section drafts are not Apply inputs. */
export function filletSectionNumberProblem(active: Pick<Active, 'cmd' | 'values'>): { key: 'rho' | 'tension'; text: string } | undefined {
  if (active.cmd.id !== 'fillet') return;
  const key = active.values.shape === 'conic' ? 'rho' : active.values.shape === 'g2' ? 'tension' : undefined;
  if (key && featureNumberInvalid(active.values[key], 'open-unit')) return { key, text: featureNumberRange('open-unit') + '.' };
}
