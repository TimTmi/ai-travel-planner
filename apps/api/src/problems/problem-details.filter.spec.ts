import { ArgumentsHost, MethodNotAllowedException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ProblemDetailsFilter } from './problem-details.filter';
import { PROBLEM_BASE_URI, ProblemException } from './problem.exception';

interface MockResponse {
  status: ReturnType<typeof vi.fn>;
  type: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  setHeader: ReturnType<typeof vi.fn>;
}

function createHost(): { host: ArgumentsHost; res: MockResponse } {
  const res: MockResponse = {
    status: vi.fn(),
    type: vi.fn(),
    json: vi.fn(),
    setHeader: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.type.mockReturnValue(res);

  const host = {
    switchToHttp: () => ({
      getResponse: () => res,
    }),
  } as unknown as ArgumentsHost;

  return { host, res };
}

describe('ProblemDetailsFilter', () => {
  const filter = new ProblemDetailsFilter();

  it('serializes a ProblemException with extensions as application/problem+json', () => {
    const { host, res } = createHost();
    const err = new ProblemException(
      'cap-above-group-total',
      'The cap of 5000000 VND is above the group total of 4000000 VND',
      {
        errors: [{ pointer: '/capVnd', detail: 'must be at most 4000000, the group total' }],
        groupTotalVnd: 4_000_000,
      },
    );

    filter.catch(err, host);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.type).toHaveBeenCalledWith('application/problem+json');
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      type: `${PROBLEM_BASE_URI}cap-above-group-total`,
      title: 'Cap above group total',
      status: 422,
      detail: 'The cap of 5000000 VND is above the group total of 4000000 VND',
      errors: [{ pointer: '/capVnd', detail: 'must be at most 4000000, the group total' }],
      groupTotalVnd: 4_000_000,
    });
  });

  it('sets WWW-Authenticate: Bearer on 401 unauthenticated responses', () => {
    const { host, res } = createHost();
    filter.catch(new ProblemException('unauthenticated', 'Missing token.'), host);

    expect(res.setHeader).toHaveBeenCalledWith('WWW-Authenticate', 'Bearer');
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.type).toHaveBeenCalledWith('application/problem+json');
  });

  it.each([new NotFoundException('Cannot GET /v1/missing'), new MethodNotAllowedException()])(
    'maps missing route or method to 404 not-found',
    (exception) => {
      const { host, res } = createHost();
      filter.catch(exception, host);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.type).toHaveBeenCalledWith('application/problem+json');
      expect(res.json).toHaveBeenCalledWith({
        type: `${PROBLEM_BASE_URI}not-found`,
        title: 'Not found',
        status: 404,
        detail: 'The requested resource was not found.',
      });
    },
  );

  it('hides internal details behind 500 internal', () => {
    const { host, res } = createHost();
    filter.catch(new Error('SELECT * FROM group_members failed at /app/src/db.ts'), host);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.type).toHaveBeenCalledWith('application/problem+json');
    expect(res.json).toHaveBeenCalledWith({
      type: `${PROBLEM_BASE_URI}internal`,
      title: 'Internal error',
      status: 500,
      detail: 'An unexpected error occurred.',
    });
  });
});
