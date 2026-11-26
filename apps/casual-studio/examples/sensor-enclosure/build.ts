import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { encodeStudioFile } from '@barocss/cad-model/engine/container';
import { buildSensorEnclosure } from '../../src/sensorEnclosure';

assert.ok(process.argv[2], 'provide the output .bcad filename');
await writeFile(process.argv[2], encodeStudioFile(buildSensorEnclosure()));
