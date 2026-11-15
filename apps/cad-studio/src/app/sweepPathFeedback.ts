import type { Active } from './commandState';

/** Explain the native closed-path refusal without guessing from other Sweep failures. */
export function sweepPathFeedback(active: Active): string | undefined {
  if (active.cmd.id === 'sweep-curve' && active.preview === 'error'
    && active.error?.detail.includes('the path is closed: a closed sweep is not supported yet (open the path)')) {
    return 'Path is closed. Select an open curve.';
  }
}
