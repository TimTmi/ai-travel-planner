import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ProblemException } from '../problems/problem.exception';
import { SupabaseAuthService } from './supabase-auth.service';

export interface AuthenticatedUser {
  id: string;
}

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthenticatedUser;
}

const BEARER_PATTERN = /^Bearer\s+(\S+)$/;

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly auth: SupabaseAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;

    if (typeof header !== 'string') {
      throw new ProblemException('unauthenticated', 'Missing Authorization header.');
    }

    const match = BEARER_PATTERN.exec(header);
    const token = match?.[1];
    if (!token) {
      throw new ProblemException(
        'unauthenticated',
        'Authorization header must use the Bearer scheme.',
      );
    }

    const { userId } = await this.auth.verifyAccessToken(token);
    request.user = { id: userId };
    return true;
  }
}
