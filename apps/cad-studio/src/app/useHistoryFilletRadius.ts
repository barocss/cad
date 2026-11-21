import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { prefixDoc, type StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult, EvalResult } from '@barocss/cad-model/engine/evaluate';
import type { EngineClient } from '../engine/client';
import { createHistoryFilletReads, historyFilletReceipt, ordinaryHistoryFillet, type HistoryFilletReceipt } from '../state/historyFilletRadiusReceipt';

export function useHistoryFilletRadius(options:{
  doc:StudioDoc; commandDoc:StudioDoc; bodies:readonly BodyResult[]; index:number|null;
  enabled:boolean; readIdle:boolean; evaluated:StudioDoc; worker:number; open:object; scope:object;
  engine:Pick<EngineClient,'part'>; revision():number; liveSourceCurrent():boolean; idle(): boolean;
}) {
  const { doc,commandDoc,bodies,index,enabled,readIdle,evaluated,worker,open,scope,engine }=options;
  const source=useMemo(()=>({}),[doc,commandDoc,bodies,index,enabled,evaluated,worker,open,scope,engine]);
  const latest=useRef({options,source});
  const mounted=useRef(false);
  useLayoutEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useLayoutEffect(()=>{latest.current={options,source};});
  const [receipt,setReceipt]=useState<HistoryFilletReceipt>();
  const reads=useMemo(()=>createHistoryFilletReads<{result:EvalResult;revision:number}>(),[]);
  const ordinary=ordinaryHistoryFillet(doc,index);
  useEffect(()=>{
    if (!enabled||!readIdle||index===null||!ordinary||!options.idle()||!options.liveSourceCurrent()) return;
    let stillReading=true;
    const current=()=>mounted.current && latest.current.source===source && latest.current.options.liveSourceCurrent();
    void reads(source,async()=>{
      const stock=prefixDoc(doc,index), revision=options.revision();
      return {result:await engine.part(stock,revision,'refs'),revision};
    }).then(({result,revision})=>{
      if(!stillReading||!current()||!latest.current.options.idle()) return;
      const next=historyFilletReceipt(doc,commandDoc,index,bodies,result,revision,current);
      if(next) setReceipt(previous=>previous?.isCurrent()?previous:next);
    }).catch(()=>{/* History still accepts a typed radius when source proof is unavailable. */});
    return ()=>{stillReading=false;};
  },[source,enabled,readIdle,ordinary,reads,doc,index,engine,commandDoc,bodies]);
  const ready=enabled&&receipt?.document===doc&&receipt.commandDoc===commandDoc&&receipt.bodies===bodies&&receipt.index===index&&receipt.isCurrent()
    ?receipt:undefined;
  const sketch = doc.nodes[0];
  const pending = ordinary?.edges.length === 2 ? 'pair'
    : ordinary && sketch.kind === 'sketch' && sketch.profile === 'loop' ? 'circular' : undefined;
  return { receipt:ready, eligible:!!ordinary, pending } as const;
}
