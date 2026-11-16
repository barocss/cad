import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFlow } from './flow-helper.mjs';
const f = await createFlow({name:'project-recovery-warning',envFrozen:'RECOVERY_WARNING_FROZEN',output:process.argv[2],qualification:'Recovery warning truthful copy and unchanged Restore/Save controls',initialFiles:['apps/cad-studio/test/project-recovery-warning-browser.mjs'],requiredFrozen:['apps/cad-studio/src/storage/VersionsPanel.tsx'],limits:['Synthetic OPFS checkpoint; no save-generation lifecycle fix or native folder qualification.']});
await f.run(async () => {
  const saved=JSON.parse(await readFile(new URL('./fixtures/bracket.bcad',import.meta.url),'utf8'));
  const recovery=structuredClone(saved); recovery.nodes[1].height=8;
  assert.notDeepEqual(saved,recovery);
  for (const width of [1440,1024]) {
    await f.newPage(); await f.page.setViewportSize({width,height:1000});
    const name=`recovery-warning-${width}`;
    await f.page.evaluate(async ({name,saved,recovery})=>{
      const root=await navigator.storage.getDirectory(); const projects=await root.getDirectoryHandle('projects',{create:true}); const p=await projects.getDirectoryHandle(name,{create:true});
      const put=async(dir,file,value)=>{const h=await dir.getFileHandle(file,{create:true}); const w=await h.createWritable(); await w.write(JSON.stringify(value)); await w.close();};
      await put(p,'bracket.bcad',saved);
      const meta=await p.getDirectoryHandle('.barocss',{create:true}); const auto=await meta.getDirectoryHandle('autosave',{create:true}); await put(auto,'bracket.bcad',recovery);
    },{name,saved,recovery});
    const page=f.page; await page.getByRole('button',{name:'Project and versions',exact:true}).click();
    const panel=page.getByRole('complementary',{name:'Versions panel',exact:true});
    await panel.getByRole('textbox',{name:'Browser project name',exact:true}).fill(name);
    await panel.getByRole('button',{name:'Project in this browser',exact:true}).click();
    await panel.getByRole('button',{name:'Open bracket.bcad',exact:true}).click();
    const warning=page.getByRole('status',{name:'Autosaved work',exact:true}); await warning.waitFor();
    assert.match(await warning.innerText(),/It may be older or from another window/);
    assert.match(await warning.innerText(),/saved file stays unchanged until you Save/);
    assert.equal(await warning.getByRole('button',{name:'Restore autosaved work'}).isVisible(),true);
    assert.equal(await warning.getByRole('button',{name:'Discard autosaved work'}).isVisible(),true);
    await f.snapshot(`${width}-warning`);
  }
});
