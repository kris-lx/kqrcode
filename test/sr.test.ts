import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { superResolve } from '../src/sr.ts';

const ref = JSON.parse(readFileSync(new URL('../models/sr_reference.json', import.meta.url), 'utf8'));

for (const i of [0, 1]) {
  test(`JS SR kernel matches OpenCV DNN (case ${i})`, () => {
    const [h, w] = ref[`in${i}`].shape;
    const x = Float32Array.from(ref[`in${i}`].data);
    const y = superResolve(x, h, w);
    const [oh, ow] = ref[`out${i}`].shape;
    assert.equal(y.height, oh);
    assert.equal(y.width, ow);
    let max = 0;
    const o = ref[`out${i}`].data as number[];
    for (let k = 0; k < o.length; k++) max = Math.max(max, Math.abs(o[k] - y.data[k]));
    assert.ok(max < 1e-4, `max abs err ${max}`);
  });
}
