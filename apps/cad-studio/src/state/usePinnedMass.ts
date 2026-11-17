import { useRef, useState } from 'react';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { captureMassMembers, readPinnedMass, type MassMember, type PinnedMassResult } from '../app/pinnedMass';

export function usePinnedMass(input: { session: object; doc: StudioDoc; bodies: readonly BodyResult[]; current: boolean; canPin: boolean; selected: readonly number[]; material: string }) {
  const [saved, setSaved] = useState<{ session: object; members: MassMember[] } | null>(null);
  const live = useRef(input); live.current = input;
  const pin = saved?.session === input.session ? saved : null;
  if (saved && !pin) setSaved(null);
  const offer = input.current && input.canPin ? captureMassMembers(input.doc, input.bodies, input.selected) : null;
  const offerResult = offer ? readPinnedMass(input.doc, input.bodies, offer, input.material) : null;
  const result: PinnedMassResult | null = pin ? input.current ? readPinnedMass(input.doc, input.bodies, pin.members, input.material)
    : { ok: false, reason: 'Waiting for the current accepted base-part result.' } : null;
  return { pinned: !!pin, result, canPin: !!offer && !!offerResult?.ok,
    pin() {
      const now = live.current;
      // A fresh render wrapper is not an owner change. Compare actual authority,
      // then capture and qualify every member again from the live snapshot.
      if (now.session !== input.session || now.doc !== input.doc || now.bodies !== input.bodies
        || now.current !== input.current || now.canPin !== input.canPin || now.material !== input.material
        || now.selected.length !== input.selected.length || !now.selected.every(i => input.selected.includes(i))
        || !now.current || !now.canPin) return;
      const members = captureMassMembers(now.doc, now.bodies, now.selected);
      if (!members || !readPinnedMass(now.doc, now.bodies, members, now.material).ok) return;
      setSaved({ session: now.session, members });
    },
    clear() { setSaved(null); },
  };
}
