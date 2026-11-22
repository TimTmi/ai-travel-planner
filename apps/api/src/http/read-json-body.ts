import type { IncomingHttpHeaders } from 'node:http';
import type { Readable } from 'node:stream';
import { ProblemException } from '../problems/problem.exception';

export const MAX_BODY_BYTES = 16 * 1024;

export type JsonBodyRequest = Readable & { headers: IncomingHttpHeaders };

const JSON_CONTENT_TYPE = /^application\/json\s*(;|$)/i;

function bodyProblem(detail: string): ProblemException {
  return new ProblemException('validation', 'The request body is invalid.', {
    errors: [{ pointer: '', detail }],
  });
}

// Collects at most `limit` bytes. Past the limit it keeps draining the stream without storing it,
// so memory stays bounded and the connection stays usable for the 400 response.
function readRaw(req: Readable, limit: number): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    const onData = (chunk: Buffer): void => {
      size += chunk.length;
      if (size <= limit) chunks.push(chunk);
    };
    const onEnd = (): void => {
      cleanup();
      resolve(size > limit ? null : Buffer.concat(chunks));
    };
    const onError = (err: Error): void => {
      cleanup();
      reject(err);
    };
    const cleanup = (): void => {
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('error', onError);
    };

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
  });
}

/**
 * Reads a request body as a JSON object, in the order the contracts check it:
 * at most MAX_BODY_BYTES, else `validation`; a non-empty body sent as application/json must be
 * valid UTF-8 JSON, else `invalid-json`; it must be present, sent as application/json and be an
 * object, else `validation` with pointer "".
 *
 * Call it only after authentication and authorization, so those errors come first.
 */
export async function readJsonBody(req: JsonBodyRequest): Promise<Record<string, unknown>> {
  const declaredLength = Number(req.headers['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw bodyProblem(`must be at most ${MAX_BODY_BYTES} bytes`);
  }

  const raw = await readRaw(req, MAX_BODY_BYTES);
  if (raw === null) throw bodyProblem(`must be at most ${MAX_BODY_BYTES} bytes`);

  const contentType = req.headers['content-type'] ?? '';
  if (raw.length === 0 || !JSON_CONTENT_TYPE.test(contentType)) {
    throw bodyProblem('must be a JSON object sent as application/json');
  }

  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
  } catch {
    throw new ProblemException('invalid-json', 'The request body is not valid JSON.');
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw bodyProblem('must be a JSON object');
  }
  return value as Record<string, unknown>;
}
