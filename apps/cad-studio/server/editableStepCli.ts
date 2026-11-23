import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';
import { encodeStudioFile } from '@barocss/cad-model/engine/container';
import { emptyDoc, withNode } from '@barocss/cad-model/engine/doc';
import { editableStepByteLimit, editableStepCopy } from '@barocss/cad-model/engine/editableStepCopy';
import { sha256Hex, sha256Text } from '@barocss/cad-model/util/digest';
import type { CliIo } from './cadCli';
import { writeAtomicNew } from './cadDoc';

const sourceFile = /\.(step|stp)$/i;
const outputFile = /\.bcad$/i;
const reviewId = /^[0-9a-f]{64}$/;
const localPath = (path: string) => !/^[a-z][a-z0-9+.-]*:/i.test(path) || /^[a-z]:[\\/]/i.test(path);
const codeOf = (error: unknown) => (error as NodeJS.ErrnoException)?.code;

function readStep(path: string): Buffer {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw Error('Use a regular STEP file.');
    if (stat.size > editableStepByteLimit) throw Error('This STEP file exceeds the editable copy size limit (96 KiB).');
    const bytes = Buffer.alloc(editableStepByteLimit + 1);
    let count = 0;
    while (count < bytes.length) {
      const n = readSync(fd, bytes, count, bytes.length - count, null);
      if (!n) break;
      count += n;
    }
    if (count > editableStepByteLimit) throw Error('This STEP file exceeds the editable copy size limit (96 KiB).');
    return bytes.subarray(0, count);
  } finally { closeSync(fd); }
}

export function editableStepMain(args: readonly string[], io: CliIo): number {
  const fail = (code: string, message: string, status = 1) => {
    io.stderr.write(JSON.stringify({ ok: false, code, message }) + '\n');
    return status;
  };
  const usage = () => fail('USAGE', 'Use editable-step source.step [--named]. To save, add --review <review-id> -o new-copy.bcad.', 2);
  let parsed;
  try {
    parsed = parseArgs({ args: [...args], allowPositionals: true, tokens: true,
      options: { named: { type: 'boolean' }, review: { type: 'string' }, out: { type: 'string', short: 'o' } } });
  } catch { return usage(); }
  const [input] = parsed.positionals, { out, named, review } = parsed.values;
  const flags = parsed.tokens.flatMap(token => token.kind === 'option' ? [token.name] : []);
  if (parsed.positionals.length !== 1 || new Set(flags).size !== flags.length || !localPath(input) || !sourceFile.test(input)
    || (out === undefined) !== (review === undefined) || out !== undefined && (!localPath(out) || !outputFile.test(out))
    || review !== undefined && !reviewId.test(review)) return usage();

  let original: Buffer, step: string;
  try {
    original = readStep(input);
    step = new TextDecoder('utf-8', { fatal: true }).decode(original);
  } catch (error) {
    return fail('STEP_READ', codeOf(error) ? 'Could not read the local STEP file.' : (error as Error).message);
  }
  const name = basename(input), sourceSha256 = sha256Hex(original);
  const copy = editableStepCopy(withNode(emptyDoc(), { kind: 'import', name, step }), named);
  if ('error' in copy) return fail('UNSUPPORTED_STEP', copy.error);
  const doc = named ? copy.named : copy.doc;
  if (!doc) return fail('UNSUPPORTED_DRIVERS', 'This STEP recipe has no certified named drivers.');
  const bytes = encodeStudioFile(doc), candidateSha256 = sha256Hex(bytes);
  const current = sha256Text(sourceSha256 + ':' + candidateSha256);
  if (review !== undefined && review !== current) return fail('STALE_REVIEW', 'The source or the candidate changed. Run the review again.');
  if (out !== undefined) {
    try {
      if (!readStep(input).equals(original)) return fail('STALE_REVIEW', 'The source changed. Run the review again.');
    } catch { return fail('STALE_REVIEW', 'The source changed or cannot be read. Run the review again.'); }
    try { writeAtomicNew(out, bytes); }
    catch (error) {
      if (codeOf(error) === 'EEXIST') return fail('FILE_EXISTS', 'Choose a new output filename.');
      return fail('COPY_WRITE', 'Could not write the new BCAD file.');
    }
  }
  io.stdout.write(JSON.stringify({
    ok: true, review: current, source: { name, sha256: sourceSha256, units: 'mm' },
    candidate: { family: copy.family, sha256: candidateSha256, history: 'new', nodes: doc.nodes, parameters: doc.parameters },
    ...(out !== undefined ? { written: basename(out) } : {}),
  }) + '\n');
  return 0;
}
