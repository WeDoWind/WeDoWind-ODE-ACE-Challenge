import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIssue, imageExtension, downloadScreenshot } from './import-issue.mjs';

const body = `### Title

Wind display

### Creators

Community team

### Description

A live view of the turbine.

### URL

https://example.org/display

### Screenshot

![Display](https://github.com/user-attachments/assets/example)
`;

test('imports GitHub form fields with LF or CRLF and HTML screenshots', () => {
  for (const text of [body, body.replaceAll('\n', '\r\n'), body.replace('![Display](https://github.com/user-attachments/assets/example)', '<img width="800" src="https://github.com/user-attachments/assets/example" />')]) {
    assert.equal(parseIssue(text).creator, 'Community team');
    assert.equal(parseIssue(text).summary, 'A live view of the turbine.');
  }
});
test('rejects missing, duplicate, oversized, and unsafe fields', () => {
  for (const text of [
    body.replace('Community team', '_No response_'),
    body + '\n### Title\n\nAnother title\n',
    body.replace('A live view of the turbine.', 'x'.repeat(241)),
    body.replace('https://example.org/display', 'javascript:alert(1)'),
    body.replace('https://github.com/user-attachments/assets/example', 'https://localhost/private.png'),
    body.replace('https://github.com/user-attachments/assets/example', 'https://github.com/other/path'),
  ]) assert.throws(() => parseIssue(text));
});
test('recognises allowed image signatures and rejects other files', () => {
  assert.equal(imageExtension(Buffer.from([137,80,78,71,13,10,26,10])), 'png');
  assert.equal(imageExtension(Buffer.from([255,216,255])), 'jpg');
  assert.equal(imageExtension(Buffer.from('RIFF0000WEBP')), 'webp');
  assert.throws(() => imageExtension(Buffer.from('<html>')));
});

test('downloads GitHub screenshots through allowed redirects without credentials', async () => {
  const calls = [];
  const response = await downloadScreenshot('https://github.com/user-attachments/assets/example', async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1
      ? new Response(null, { status: 302, headers: { location: 'https://private-user-images.githubusercontent.com/example.png' } })
      : new Response('image');
  });
  assert.equal(await response.text(), 'image');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.redirect, 'manual');
  assert.equal(calls[1].options.headers, undefined);
});

test('blocks unsafe screenshot redirects and redirect loops', async () => {
  for (const location of ['http://github.com/image', 'https://localhost/image', 'https://github.com:444/image', 'https://user:password@github.com/image']) {
    let calls = 0;
    await assert.rejects(downloadScreenshot('https://github.com/user-attachments/assets/example', async () => {
      calls++;
      return new Response(null, { status: 302, headers: { location } });
    }), /approved GitHub image storage/);
    assert.equal(calls, 1);
  }
  await assert.rejects(downloadScreenshot('https://github.com/user-attachments/assets/example', async () =>
    new Response(null, { status: 302, headers: { location: '/user-attachments/assets/example' } })), /too many redirects/);
});
