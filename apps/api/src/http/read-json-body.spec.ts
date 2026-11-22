import type { IncomingHttpHeaders } from 'node:http';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { MAX_BODY_BYTES, readJsonBody, type JsonBodyRequest } from './read-json-body';

function request(body: string | Buffer, headers: IncomingHttpHeaders = {}): JsonBodyRequest {
  const chunks = body.length === 0 ? [] : [Buffer.from(body)];
  return Object.assign(Readable.from(chunks), { headers });
}

const json = { 'content-type': 'application/json' };

function bodyValidation(detail: string): object {
  return {
    slug: 'validation',
    status: 400,
    body: expect.objectContaining({ errors: [{ pointer: '', detail }] }) as object,
  };
}

describe('readJsonBody', () => {
  it('returns a JSON object sent as application/json', async () => {
    await expect(readJsonBody(request('{"capVnd":600000}', json))).resolves.toEqual({
      capVnd: 600000,
    });
  });

  it('accepts a charset parameter on the content type', async () => {
    const req = request('{"capVnd":null}', { 'content-type': 'application/json; charset=utf-8' });
    await expect(readJsonBody(req)).resolves.toEqual({ capVnd: null });
  });

  it('rejects an empty body with validation, pointer ""', async () => {
    await expect(readJsonBody(request('', json))).rejects.toMatchObject(
      bodyValidation('must be a JSON object sent as application/json'),
    );
  });

  it('rejects a body not sent as application/json with validation, even if it is not JSON', async () => {
    const req = request('{not json', { 'content-type': 'text/plain' });
    await expect(readJsonBody(req)).rejects.toMatchObject(
      bodyValidation('must be a JSON object sent as application/json'),
    );
  });

  it('rejects malformed JSON with invalid-json', async () => {
    await expect(readJsonBody(request('{"capVnd":', json))).rejects.toMatchObject({
      slug: 'invalid-json',
      status: 400,
    });
  });

  it('rejects bytes that are not UTF-8 with invalid-json', async () => {
    const req = request(Buffer.from([0x7b, 0xff, 0x7d]), json);
    await expect(readJsonBody(req)).rejects.toMatchObject({ slug: 'invalid-json' });
  });

  it.each(['[]', '5', 'null', '"text"'])(
    'rejects %s, valid JSON but not an object',
    async (body) => {
      await expect(readJsonBody(request(body, json))).rejects.toMatchObject(
        bodyValidation('must be a JSON object'),
      );
    },
  );

  it('rejects a body over the limit with validation, before parsing it', async () => {
    const big = `{"capVnd":1,"pad":"${'x'.repeat(MAX_BODY_BYTES)}`; // over the limit and not valid JSON
    await expect(readJsonBody(request(big, json))).rejects.toMatchObject(
      bodyValidation(`must be at most ${MAX_BODY_BYTES} bytes`),
    );
  });

  it('rejects a declared Content-Length over the limit without reading the body', async () => {
    const req = request('{}', { ...json, 'content-length': String(MAX_BODY_BYTES + 1) });
    await expect(readJsonBody(req)).rejects.toMatchObject(
      bodyValidation(`must be at most ${MAX_BODY_BYTES} bytes`),
    );
  });

  it('accepts a body of exactly the limit', async () => {
    const prefix = '{"pad":"';
    const body = `${prefix}${'x'.repeat(MAX_BODY_BYTES - prefix.length - 2)}"}`;
    expect(Buffer.byteLength(body)).toBe(MAX_BODY_BYTES);
    await expect(readJsonBody(request(body, json))).resolves.toHaveProperty('pad');
  });
});
