import type { Active } from './commandState';
import { featureNumberInvalid, featureNumberRange } from './featureNumberInput';

/** Replace only the owned simple radius refusal; keep geometry and other-field errors. */
export function hasInlineFilletRadiusError(active: Pick<Active, 'cmd' | 'values' | 'error'>): boolean {
  return active.cmd.id === 'fillet' && String(active.values.radius).trim() !== ''
    && featureNumberInvalid(active.values.radius, 'positive')
    && active.error?.title === 'Enter a valid Radius'
    && active.error.hint === featureNumberRange('positive') + '.' && !active.error.detail;
}
