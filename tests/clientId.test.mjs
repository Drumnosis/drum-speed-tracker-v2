import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClientId } from '../src/utils/clientId.ts';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
test('session IDs are valid distinct UUIDs', () => {
  const ids = Array.from({ length: 100 }, createClientId);
  assert.equal(new Set(ids).size, 100);
  assert.ok(ids.every(id => uuid.test(id)));
});
test('HTTP phone testing works when crypto.randomUUID is unavailable', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis.crypto, 'randomUUID');
  Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true });
  try {
    const ids = Array.from({ length: 100 }, createClientId);
    assert.equal(new Set(ids).size, 100);
    assert.ok(ids.every(id => uuid.test(id)));
  } finally {
    if (descriptor) Object.defineProperty(globalThis.crypto, 'randomUUID', descriptor);
    else delete globalThis.crypto.randomUUID;
  }
});
