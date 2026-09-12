// ─────────────────────────────────────────────
// AppError — typed, structured application error.
//
// Route handlers throw AppError instead of calling res.json() directly.
// The centralized errorHandler middleware catches it and formats the response.
// This keeps route logic clean and guarantees a consistent error shape.
// ─────────────────────────────────────────────

export enum ErrorCode {
  // Auth
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  TOKEN_EXPIRED = "TOKEN_EXPIRED",

  // Validation
  VALIDATION_ERROR = "VALIDATION_ERROR",
  INVALID_INPUT = "INVALID_INPUT",

  // Resources
  NOT_FOUND = "NOT_FOUND",
  CONFLICT = "CONFLICT",

  // Server
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  /** Structured field-level errors (from Zod validation) */
  public readonly details?: Record<string, string[]>;

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    details?: Record<string, string[]>
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;

    // Maintain proper prototype chain in compiled JS
    Object.setPrototypeOf(this, AppError.prototype);
  }

  // ── Factory helpers ───────────────────────

  static unauthorized(message = "Authentication required"): AppError {
    return new AppError(401, ErrorCode.UNAUTHORIZED, message);
  }

  static forbidden(message = "You do not have permission to perform this action"): AppError {
    return new AppError(403, ErrorCode.FORBIDDEN, message);
  }

  static notFound(resource: string): AppError {
    return new AppError(404, ErrorCode.NOT_FOUND, `${resource} not found`);
  }

  static conflict(message: string): AppError {
    return new AppError(409, ErrorCode.CONFLICT, message);
  }

  static validation(message: string, details?: Record<string, string[]>): AppError {
    return new AppError(400, ErrorCode.VALIDATION_ERROR, message, details);
  }

  static internal(message = "An unexpected error occurred"): AppError {
    return new AppError(500, ErrorCode.INTERNAL_ERROR, message);
  }
}
