import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire, isBuiltin } from 'node:module';
import { resolve, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const [repo, output, validLegacy, marked] = process.argv.slice(2);
const sha = '4d723c72b77c1f48fb8ef5f8f6ffef0947ccd742';
const root = join(output, 'old-source'), archive = join(output, 'old-source.tar');
const packages = { '@barocss/cad': 'packages/barocss-cad', '@barocss/cad-model': 'packages/barocss-cad-model' };
await mkdir(root);
execFileSync('git', ['archive', '--output', archive, sha, ...Object.values(packages).flatMap(dir => [dir + '/src', dir + '/package.json'])], { cwd: repo });
execFileSync('tar', ['-xf', archive, '-C', root]);
const { build } = createRequire(join(repo, 'apps/cad-studio/package.json'))('esbuild');
const manifest = Object.fromEntries(await Promise.all(Object.entries(packages).map(async ([name, dir]) =>
  [name, JSON.parse(await readFile(join(root, dir, 'package.json'), 'utf8'))])));
const outfile = join(output, 'pinned-reader-bundle.mjs');
const entry = join(root, packages['@barocss/cad-model'], 'src/engine');
const result = await build({
  absWorkingDir: root, outfile, bundle: true, format: 'esm', platform: 'node', target: 'node22', metafile: true,
  stdin: { contents: `export { readStudioDoc } from ${JSON.stringify(join(entry, 'migrate.ts'))};
    export { readStudioFile } from ${JSON.stringify(join(entry, 'container.ts'))};`, resolveDir: root },
  plugins: [{ name: 'git-pinned-cad-reader', setup(build) {
    build.onResolve({ filter: /^[^./]/ }, args => {
      if (isBuiltin(args.path)) return { path: args.path, external: true };
      const name = Object.keys(packages).find(name => args.path === name || args.path.startsWith(name + '/'));
      assert.ok(name, 'Unexpected runtime dependency: ' + args.path);
      const sub = args.path === name ? '.' : './' + args.path.slice(name.length + 1);
      const exports = manifest[name].exports;
      const wildcard = Object.keys(exports).find(key => key.endsWith('*') && sub.startsWith(key.slice(0, -1)));
      const target = exports[sub]?.import ?? (wildcard && exports[wildcard].import.replace('*', sub.slice(wildcard.length - 1)));
      assert.equal(typeof target, 'string', args.path);
      return { path: join(root, packages[name], target) };
    });
  } }],
});
const paths = Object.keys(result.metafile.inputs).filter(name => !name.startsWith('<'));
assert.ok(paths.length > 50);
for (const name of paths) assert.ok(!relative(root, resolve(root, name)).startsWith('../'), name);
const { readStudioDoc, readStudioFile } = await import(pathToFileURL(outfile));
const before = await readFile(validLegacy), after = await readFile(marked);
assert.deepEqual(readStudioDoc(before.toString()).doc, JSON.parse(before));
assert.deepEqual((await readStudioFile(new Uint8Array(before))).doc, JSON.parse(before));
const refusal = /\[BAD_REFERENCE\] Sketch 1, perpendicular constraint 1 needs two different straight edges/;
assert.match(readStudioDoc(after.toString()).error, refusal);
assert.match((await readStudioFile(new Uint8Array(after))).error, refusal);
console.log(JSON.stringify({ status: 'PASS', sha, sourceCount: paths.length, raw: 'explicit refusal', native: 'explicit refusal', original: 'exact acceptance' }));
