import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  MethodNotAllowedException,
  NotFoundException,
} from '@nestjs/common';
import { ProblemException } from './problem.exception';

interface HttpResponse {
  setHeader(name: string, value: string): unknown;
  status(code: number): HttpResponse;
  type(value: string): HttpResponse;
  json(body: unknown): unknown;
}

function isMalformedJsonError(exception: unknown): boolean {
  if (typeof exception !== 'object' || exception === null) return false;
  const record = exception as Record<string, unknown>;
  if (record['type'] === 'entity.parse.failed') return true;
  return exception instanceof SyntaxError && record['status'] === 400;
}

function toProblemException(exception: unknown): ProblemException {
  if (exception instanceof ProblemException) {
    return exception;
  }

  if (isMalformedJsonError(exception)) {
    return new ProblemException('invalid-json', 'The request body is not valid JSON.');
  }

  if (exception instanceof NotFoundException || exception instanceof MethodNotAllowedException) {
    return new ProblemException('not-found', 'The requested resource was not found.');
  }

  return new ProblemException('internal', 'An unexpected error occurred.');
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>();
    const problem = toProblemException(exception);

    if (problem.status === 401) {
      response.setHeader('WWW-Authenticate', 'Bearer');
    }

    response.status(problem.status).type('application/problem+json').json(problem.body);
  }
}
