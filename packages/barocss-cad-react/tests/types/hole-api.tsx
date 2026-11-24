import * as React from 'react';
import {Hole,Extrude,Rectangle,type HoleProps,type SolidHandle,type ProfileHandle} from '../../src/index.js';
const solid=React.createRef<SolidHandle>(),profile=React.createRef<ProfileHandle>();
const props:HoleProps={solid,center:[30,20],radius:4,depth:6,axis:'z',side:'max'};
const nested=<Hole center={[30,20]} radius={4}><Extrude distance={20}><Rectangle min={[0,0]} max={[60,40]}/></Extrude></Hole>;
const reused=<Hole {...props} ref={solid}/>;
// @ts-expect-error child and solid are exclusive
const mixed=<Hole solid={solid} center={[0,0]} radius={4}>{nested}</Hole>;
// @ts-expect-error profile is not a solid handle
const wrong=<Hole solid={profile} center={[0,0]} radius={4}/>;
// @ts-expect-error native face selection is not exposed
const face=<Hole solid={solid} center={[0,0]} radius={4} face="n1.top"/>;
// @ts-expect-error pointed drill is a distinct native operation
const drill=<Hole solid={solid} center={[0,0]} radius={4} type="blind-drill"/>;
// @ts-expect-error required input
const missing=<Hole center={[0,0]} radius={4}/>;
void[nested,reused,mixed,wrong,face,drill,missing];
