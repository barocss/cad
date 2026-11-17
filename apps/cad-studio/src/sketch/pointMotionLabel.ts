import type { PointMotion } from '@barocss/cad-model/sketch/mobility';

/** Display precision only; never feeds a constraint or coordinate edit. */
export function pointMotionLabel(motion: PointMotion): string {
  if (!motion) return 'Direction unavailable';
  if (motion.dimension === 2) return 'Two independent directions';
  const number = (value: number) => Number(value.toFixed(6)).toString();
  return `Along ±(${motion.direction.map(number).join(', ')})`;
}
