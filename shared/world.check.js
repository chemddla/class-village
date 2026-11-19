// 지도 도우미 자가 점검: node shared/world.check.js
import assert from 'node:assert/strict';
import { inSwing } from './world.js';

assert.ok(inSwing(0, 0, 0, 0, 1)); // 바로 앞 (+z를 볼 때)
assert.ok(!inSwing(0, 0, 0, 0, -1)); // 등 뒤
assert.ok(!inSwing(0, 0, 0, 0, 2)); // 너무 멂
assert.ok(inSwing(0, 0, Math.PI * 2 - 0.1, 0.1, 1)); // 각도가 한 바퀴 넘어가도
assert.ok(inSwing(0, 0, Math.PI / 2, 1, 0)); // +x를 볼 때 오른쪽
console.log('world.check: ok');
