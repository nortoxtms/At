import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import type { ApiError, ErrorCode } from '@only-horses/shared-types';

/** Domain error carrying a §12 error code. Thrown by services. */
export class ApiException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    status: HttpStatus,
    readonly details?: unknown,
  ) {
    super(message, status);
  }

  static notFound(what: string) {
    return new ApiException('NOT_FOUND', `${what} bulunamadı.`, HttpStatus.NOT_FOUND);
  }

  static forbidden(message = 'Bu işlem için yetkin yok.') {
    return new ApiException('FORBIDDEN', message, HttpStatus.FORBIDDEN);
  }

  static unauthorized(message = 'Giriş yapman gerekiyor.') {
    return new ApiException('UNAUTHORIZED', message, HttpStatus.UNAUTHORIZED);
  }

  /**
   * §12 has a CONFLICT code and nothing constructed one, so every "you cannot
   * do that from this state" came back as a 400 that reads like bad input.
   * A lifecycle refusal is not a validation error: the request was well
   * formed, the world just is not in the state it assumed.
   */
  static conflict(message: string, details?: unknown) {
    return new ApiException('CONFLICT', message, HttpStatus.CONFLICT, details);
  }

  static validation(message: string, details?: unknown) {
    return new ApiException('VALIDATION_ERROR', message, HttpStatus.BAD_REQUEST, details);
  }

  /**
   * §3.3's hard rule surfaces here. The client turns this code into the
   * verification sheet described in §18.2 S08 step 9, so the code matters
   * more than the message.
   */
  static verificationRequired(message: string, details?: unknown) {
    return new ApiException('VERIFICATION_REQUIRED', message, HttpStatus.FORBIDDEN, details);
  }

  static limitExceeded(message: string, details?: unknown) {
    return new ApiException('LIMIT_EXCEEDED', message, HttpStatus.FORBIDDEN, details);
  }

  static paymentRequired(message: string, details?: unknown) {
    return new ApiException('PAYMENT_REQUIRED', message, HttpStatus.PAYMENT_REQUIRED, details);
  }

  /** §14.4 welfare rules block publishing with a specific reason (§24.28). */
  static prohibitedContent(message: string, details?: unknown) {
    return new ApiException('PROHIBITED_CONTENT', message, HttpStatus.UNPROCESSABLE_ENTITY, details);
  }
}

/**
 * Renders every error in the §12 envelope: { error: { code, message,
 * details, requestId } }. Nothing else may reach the client — an unhandled
 * exception leaking a stack trace would also leak the schema.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request as Request & { requestId?: string }).requestId ?? 'unknown';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ErrorCode = 'INTERNAL_ERROR';
    let message = 'Bir şeyler ters gitti. Tekrar dene.';
    let details: unknown;

    if (exception instanceof ApiException) {
      status = exception.getStatus();
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (isZodError(exception)) {
      // Controllers validate query strings with `schema.parse()`, which throws
      // a bare ZodError. Without this branch a mistyped `?sort=` came back as
      // 500 INTERNAL_ERROR: the wrong status for the client, and — worse —
      // ordinary client mistakes logged as server errors, which is exactly the
      // noise §24.20's "no open P0/P1" depends on not existing.
      status = HttpStatus.BAD_REQUEST;
      code = 'VALIDATION_ERROR';
      message = 'Gönderdiğin bilgilerde hata var.';
      details = exception.issues.map((issue) => ({
        path: issue.path.join('.'),
        code: issue.code,
        message: issue.message,
      }));
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = mapStatusToCode(status);
      const body = exception.getResponse();
      message = typeof body === 'string' ? body : ((body as { message?: string }).message ?? message);
      if (typeof body === 'object') details = (body as { details?: unknown }).details;
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} [${requestId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const payload: ApiError = { error: { code, message, requestId } };
    if (details !== undefined) payload.error.details = details;

    response.status(status).json(payload);
  }
}

/**
 * `instanceof ZodError` is not reliable here.
 *
 * The schemas live in `@only-horses/shared-types`, which resolves zod's ESM
 * build, while this file is compiled to CommonJS and resolves the CJS build.
 * Same version, same package, two distinct class objects — so the prototype
 * check silently failed and every validation error was still answered with a
 * 500. Structural identification is what actually holds across that seam.
 */
function isZodError(exception: unknown): exception is ZodError {
  return (
    exception instanceof ZodError ||
    (exception instanceof Error &&
      exception.name === 'ZodError' &&
      Array.isArray((exception as { issues?: unknown }).issues))
  );
}

function mapStatusToCode(status: number): ErrorCode {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'VALIDATION_ERROR';
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHORIZED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'CONFLICT';
    case HttpStatus.PAYMENT_REQUIRED:
      return 'PAYMENT_REQUIRED';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'RATE_LIMITED';
    default:
      return 'INTERNAL_ERROR';
  }
}
