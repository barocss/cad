import type { StudioDoc } from '@barocss/cad-model/engine/doc';

const own = (record: object, key: PropertyKey) => Object.getOwnPropertyDescriptor(record,key);
const data = (entry: PropertyDescriptor | undefined): entry is PropertyDescriptor & {value:unknown} =>
  !!entry && Object.hasOwn(entry,'value');
const record = (value: unknown): value is object =>
  value !== null && typeof value === 'object' && (Object.getPrototypeOf(value)===Object.prototype || Object.getPrototypeOf(value)===null);

function sameOwnFields(a: object, b: object, except: PropertyKey): boolean {
  const left = Reflect.ownKeys(a).filter(key=>key!==except);
  const right = Reflect.ownKeys(b).filter(key=>key!==except);
  return left.length===right.length && left.every(key=>{
    const one=own(a,key), two=own(b,key);
    return data(one) && data(two) && Object.is(one.value,two.value);
  });
}

/** The Browser eye alone may carry diagnostics through a committed one-body hidden toggle. */
export function isBodyEyeVisibilityOnly(previous: StudioDoc, next: StudioDoc): boolean {
  if (previous===next || !sameOwnFields(previous,next,'bodies')) return false;
  const leftMap=own(previous,'bodies'), rightMap=own(next,'bodies');
  if ((leftMap && (!data(leftMap) || !record(leftMap.value))) ||
      (rightMap && (!data(rightMap) || !record(rightMap.value)))) return false;
  const before=leftMap?.value??{}, after=rightMap?.value??{};
  if (before===after) return false;
  const keys=new Set([...Reflect.ownKeys(before),...Reflect.ownKeys(after)]);
  let toggles=0;
  for (const key of keys) {
    const left=own(before,key), right=own(after,key);
    if ((left && (!data(left) || !record(left.value))) ||
        (right && (!data(right) || !record(right.value)))) return false;
    if (left && right && left.value===right.value) continue;
    if (typeof key!=='string' || ++toggles!==1) return false;
    const a=left?.value??{}, b=right?.value??{};
    const oldHidden=own(a,'hidden'), newHidden=own(b,'hidden');
    const becomesHidden=data(newHidden) && newHidden.value===true && (!oldHidden || (data(oldHidden) && oldHidden.value===false));
    const becomesShown=data(oldHidden) && oldHidden.value===true && !newHidden;
    if ((!becomesHidden && !becomesShown) || !sameOwnFields(a,b,'hidden')) return false;
  }
  return toggles===1;
}
