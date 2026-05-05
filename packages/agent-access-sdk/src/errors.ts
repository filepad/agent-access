// FILE MEMO: Typed error taxonomy for the Filepad Agent Access SDK, mapped to backend error codes.

export class FilepadAgentError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'FilepadAgentError';
  }
}

export class AuthenticationError extends FilepadAgentError {
  constructor(message: string, status = 401) {
    super('UNAUTHENTICATED', message, status);
    this.name = 'AuthenticationError';
  }
}

export class ForbiddenScopeError extends FilepadAgentError {
  constructor(message: string) {
    super('FORBIDDEN_SCOPE', message, 403);
    this.name = 'ForbiddenScopeError';
  }
}

export class NotFoundError extends FilepadAgentError {
  constructor(message: string) {
    super('NOT_FOUND', message, 404);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends FilepadAgentError {
  constructor(code: string, message: string) {
    super(code, message, 409);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends FilepadAgentError {
  constructor(message: string, status = 429) {
    super('RATE_LIMITED', message, status);
    this.name = 'RateLimitError';
  }
}

export class ProposalPathError extends FilepadAgentError {
  constructor(message: string) {
    super('FORBIDDEN_FILE_PROPOSAL_TARGET', message, 403);
    this.name = 'ProposalPathError';
  }
}

export class BaseTextMismatchError extends FilepadAgentError {
  constructor(message: string) {
    super('BASE_TEXT_HASH_MISMATCH', message, 409);
    this.name = 'BaseTextMismatchError';
  }
}

export class StaleVersionError extends FilepadAgentError {
  constructor(message: string) {
    super('STALE_ARTIFACT_VERSION', message, 409);
    this.name = 'StaleVersionError';
  }
}

export class InvalidRequestError extends FilepadAgentError {
  constructor(code: string, message: string) {
    super(code, message, 400);
    this.name = 'InvalidRequestError';
  }
}

export function fromResponse(
  status: number,
  code: string,
  message: string,
): FilepadAgentError {
  switch (code) {
    case 'UNAUTHENTICATED':
      return new AuthenticationError(message, status);
    case 'FORBIDDEN_SCOPE':
      return new ForbiddenScopeError(message);
    case 'NOT_FOUND':
      return new NotFoundError(message);
    case 'RATE_LIMITED':
      return new RateLimitError(message, status);
    case 'BASE_TEXT_HASH_MISMATCH':
      return new BaseTextMismatchError(message);
    case 'STALE_ARTIFACT_VERSION':
      return new StaleVersionError(message);
    case 'FORBIDDEN_FILE_PROPOSAL_TARGET':
      return new ProposalPathError(message);
    case 'ENVIRONMENT_NOT_INITIALIZED':
    case 'ARTIFACTS_FOLDER_MISSING':
      return new ConflictError(code, message);
    case 'INVALID_REQUEST':
    case 'INVALID_PARAMS':
    case 'INVALID_OCCURRED_AT':
    case 'INVALID_SOURCE':
    case 'INVALID_OPS':
    case 'INVALID_SCOPE':
    case 'INVALID_EDITOR_KIND':
    case 'INVALID_DOCUMENT':
    case 'NO_CHANGES_TO_PROPOSE':
      return new InvalidRequestError(code, message);
    default:
      return new FilepadAgentError(code, message, status);
  }
}
