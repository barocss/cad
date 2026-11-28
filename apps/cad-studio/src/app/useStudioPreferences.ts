import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { ViewportHandle } from '../viewport/Viewport';
import type { ThemeName } from '../viewport/renderer';

const pickFilters = ['all', 'face', 'edge', 'body'] as const;
const snapSteps = [1, 0.5, 0.1, 5, 10, 0];
export type PickFilter = typeof pickFilters[number];

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function write(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

/** Browser preferences are independent of the open part and its history. */
export function useStudioPreferences(viewport: RefObject<ViewportHandle | null>) {
  const [theme, setTheme] = useState<ThemeName>(() => (read('cad-studio-theme') as ThemeName) || 'dark');
  const [pickFilter, setPickFilter] = useState<PickFilter>(() => {
    const stored = read('studio.pick');
    return stored === 'face' || stored === 'edge' || stored === 'body' ? stored : 'all';
  });
  const [snapStep, setSnapStep] = useState(() => {
    const stored = Number(read('studio.snap') ?? '1');
    return snapSteps.includes(stored) ? stored : 1;
  });
  const [browserOpen, setBrowserOpen] = useState(() => read('cad-studio.browser') !== 'closed');
  const [material, setMaterial] = useState(() => read('studio.material') ?? 'al6061');
  const pickFilterRef = useRef(pickFilter);
  pickFilterRef.current = pickFilter;

  useEffect(() => { write('studio.material', material); }, [material]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    viewport.current?.setTheme(theme);
    write('cad-studio-theme', theme);
  }, [viewport, theme]);

  const cyclePickFilter = useCallback(() => setPickFilter(current => {
    const next = pickFilters[(pickFilters.indexOf(current) + 1) % pickFilters.length];
    write('studio.pick', next);
    return next;
  }), []);

  const cycleSnapStep = useCallback(() => setSnapStep(current => {
    const next = snapSteps[(snapSteps.indexOf(current) + 1) % snapSteps.length];
    write('studio.snap', String(next));
    return next;
  }), []);

  // A reveal can open the Browser for this visit. Only the user's toggle saves its preference.
  const toggleBrowser = useCallback(() => setBrowserOpen(current => {
    write('cad-studio.browser', current ? 'closed' : 'open');
    return !current;
  }), []);

  return { theme, setTheme, pickFilter, pickFilterRef, cyclePickFilter, snapStep, cycleSnapStep,
    browserOpen, setBrowserOpen, toggleBrowser, material, setMaterial };
}
