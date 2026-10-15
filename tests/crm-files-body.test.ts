import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boundedFileForm } from '../src/lib/crm/routes/files.ts';

test('CRM file metadata forms reject bodies over 64 KiB before parsing', async () => {
  await assert.rejects(boundedFileForm(new Request('https://example.test/crm/files', { method: 'POST', body: 'x', headers: { 'content-length': String(64 * 1024 + 1) } })), RangeError);
});

test('CRM file metadata forms enforce streamed bytes even without a length header', async () => {
  const chunk = new Uint8Array(8 * 1024); let count = 0;
  const body = new ReadableStream({ pull(controller) { if (count++ < 50) controller.enqueue(chunk); else controller.close(); } });
  // Request streaming needs duplex in Node; Response parsing matches workerd.
  const request = { headers: new Headers({ 'content-type': 'application/x-www-form-urlencoded' }), body } as Request;
  await assert.rejects(boundedFileForm(request), /Upload too large/);
  assert.ok(count < 50, 'the oversized stream is cancelled before the producer finishes');
});
