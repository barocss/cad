import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { encodeStudioFile } from '@barocss/cad-model/engine/container';
import { buildCenteringVise } from '../../src/centeringVise';

assert.ok(process.argv[2], 'provide the output .bcad filename');
await writeFile(process.argv[2], encodeStudioFile(buildCenteringVise()));
