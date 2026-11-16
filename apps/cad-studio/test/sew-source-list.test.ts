import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { SewSourceList } from '../src/ui/SewSourceList';
import { failedFeatureText } from '../src/app/failedFeature';
import type { ModelNode } from '@barocss/cad-model/engine/doc';

test('saved copied surface names retain order, duplicate labels and safe text', () => {
  const names=Object.freeze(['Dome','Side <left>','Dome']);
  const html=renderToStaticMarkup(createElement(SewSourceList,{names}));
  assert.match(html,/Copied sources · 3/);
  assert.match(html,/<li>Dome<\/li><li>Side &lt;left&gt;<\/li><li>Dome<\/li>/);
  assert.match(html,/Later source edits do not update this Sew/);
  assert.deepEqual(names,['Dome','Side <left>','Dome']);
});
test('new Sew preview does not invent an accepted History failure row', () => {
  const sew: ModelNode={kind:'sew',id:'n0',names:['Dome'],surfaces:[]};
  assert.equal(failedFeatureText('n0',[sew],[]),undefined);
  assert.equal(failedFeatureText('n0',[sew],[sew]),'Sew 1 surfaces (n0)');
  assert.equal(failedFeatureText('n1',[sew],[]),'n1 · no matching history step');
});
