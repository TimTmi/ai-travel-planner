export const PROBLEM_BASE_URI = 'https://ai-travel-planner.example/problems/';

export const PROBLEM_DEFINITIONS = {
  'invalid-json': { status: 400, title: 'Malformed JSON' },
  validation: { status: 400, title: 'Invalid request' },
  unauthenticated: { status: 401, title: 'Authentication required' },
  forbidden: { status: 403, title: 'Forbidden' },
  'not-found': { status: 404, title: 'Not found' },
  'cap-above-group-total': { status: 422, title: 'Cap above group total' },
  internal: { status: 500, title: 'Internal error' },
} as const;

export type ProblemSlug = keyof typeof PROBLEM_DEFINITIONS;

export interface ProblemErrorItem {
  pointer: string;
  detail: string;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  errors?: ProblemErrorItem[];
  groupTotalVnd?: number;
}

export interface ProblemExtensions {
  errors?: ProblemErrorItem[];
  groupTotalVnd?: number;
}

export class ProblemException extends Error {
  readonly slug: ProblemSlug;
  readonly status: number;
  readonly body: ProblemDetails;

  constructor(slug: ProblemSlug, detail: string, extensions?: ProblemExtensions) {
    super(detail);
    this.name = 'ProblemException';
    this.slug = slug;

    const definition = PROBLEM_DEFINITIONS[slug];
    this.status = definition.status;
    this.body = {
      type: `${PROBLEM_BASE_URI}${slug}`,
      title: definition.title,
      status: definition.status,
      detail,
      ...(extensions?.errors !== undefined ? { errors: extensions.errors } : {}),
      ...(extensions?.groupTotalVnd !== undefined
        ? { groupTotalVnd: extensions.groupTotalVnd }
        : {}),
    };
  }
}
