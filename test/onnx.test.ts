import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as ort from 'onnxruntime-node';

const ref = JSON.parse(readFileSync(new URL('../models/sr_reference.json', import.meta.url), 'utf8'));

test('exported ONNX model matches OpenCV DNN', async () => {
  const sess = await ort.InferenceSession.create(readFileSync(new URL('../models/wechat_sr.onnx', import.meta.url)));
  for (const i of [0, 1]) {
    const [h, w] = ref[`in${i}`].shape;
    const out = await sess.run({ data: new ort.Tensor('float32', Float32Array.from(ref[`in${i}`].data), [1, 1, h, w]) });
    const y = out.output;
    assert.deepEqual(y.dims.slice(2), ref[`out${i}`].shape);
    const o = ref[`out${i}`].data as number[];
    let max = 0;
    for (let k = 0; k < o.length; k++) max = Math.max(max, Math.abs(o[k] - (y.data as Float32Array)[k]));
    assert.ok(max < 1e-4, `max abs err ${max}`);
  }
});
