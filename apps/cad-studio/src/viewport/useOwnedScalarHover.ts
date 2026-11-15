import { useCallback, useMemo, useRef, useState, type SetStateAction } from 'react';

/** A live sample belongs to one displayed source/map, never just a matching body ID. */
export function useOwnedScalarHover(owner: object | null) {
  // An owner revisited after another source is a new hover epoch, not a pin.
  const epoch = useMemo(() => owner ? {} : null, [owner]);
  const current = useRef(epoch); current.current = epoch;
  const [sample, setSample] = useState<{ owner: object; value: number } | null>(null);
  const setHover = useCallback((next: SetStateAction<number | null>) => {
    if (current.current !== epoch) return;
    setSample(previous => {
      if (current.current !== epoch) return previous;
      const value = typeof next === 'function' ? next(previous?.owner === epoch ? previous.value : null) : next;
      if (!epoch || value === null || !Number.isFinite(value)) return previous === null ? previous : null;
      return previous?.owner === epoch && previous.value === value ? previous : { owner: epoch, value };
    });
  }, [epoch]);
  return { hover: epoch && sample?.owner === epoch ? sample.value : null, setHover };
}
