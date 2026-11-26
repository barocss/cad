export const sensorWidth = { min: 56, max: 64, default: 56 } as const;
export const sensorWidthRange = `${sensorWidth.min}–${sensorWidth.max} mm`;
export const isSensorWidth = (width: number | null): width is number =>
  width !== null && Number.isFinite(width) && width >= sensorWidth.min && width <= sensorWidth.max;
