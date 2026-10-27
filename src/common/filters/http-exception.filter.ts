import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';

interface DatabaseError {
  code?: number;
  name?: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const isDuplicate = this.isDatabaseError(exception, 11000);
    const isInvalidIdentifier = this.isDatabaseError(
      exception,
      undefined,
      'CastError',
    );
    const status = isHttpException
      ? exception.getStatus()
      : isDuplicate
        ? HttpStatus.CONFLICT
        : isInvalidIdentifier
          ? HttpStatus.BAD_REQUEST
          : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] = 'Ha ocurrido un error inesperado.';
    let errorLabel: string | undefined;

    if (isHttpException) {
      const details = this.getExceptionDetails(exception);
      message = details.message;
      errorLabel = details.errorLabel;
    } else if (isDuplicate) {
      message = 'Ya existe un recurso con esos datos.';
      errorLabel = 'Conflict';
    } else if (isInvalidIdentifier) {
      message = 'El identificador proporcionado no es valido.';
      errorLabel = 'Bad Request';
    } else {
      this.logger.error(exception);
    }

    const requestId = this.getRequestId(request);
    if ('setHeader' in response && typeof response.setHeader === 'function') {
      response.setHeader('X-Request-Id', requestId);
    }

    response.status(status).json({
      statusCode: status,
      code: this.getErrorCode(status, isDuplicate, isInvalidIdentifier),
      path: request.url,
      timestamp: new Date().toISOString(),
      requestId,
      message,
      error: errorLabel,
    });
  }

  private getRequestId(request: Request): string {
    const supplied = request.headers?.['x-request-id'];
    const value = Array.isArray(supplied) ? supplied[0] : supplied;
    return typeof value === 'string' && /^[a-zA-Z0-9._-]{1,100}$/.test(value)
      ? value
      : randomUUID();
  }

  private getErrorCode(
    status: number,
    duplicate: boolean,
    invalidIdentifier: boolean,
  ): string {
    if (duplicate) return 'DUPLICATE_RESOURCE';
    if (invalidIdentifier) return 'INVALID_IDENTIFIER';
    if (status === 500) return 'INTERNAL_ERROR';
    return `HTTP_${status}`;
  }

  private isDatabaseError(
    error: unknown,
    code?: number,
    name?: string,
  ): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const candidate = error as DatabaseError;
    return (
      (code === undefined || candidate.code === code) &&
      (name === undefined || candidate.name === name)
    );
  }

  private getExceptionDetails(exception: HttpException): {
    message: string | string[];
    errorLabel?: string;
  } {
    const response = exception.getResponse();

    if (typeof response === 'string') {
      return { message: response };
    }

    const defaultMsg = 'Ha ocurrido un error inesperado.';
    if (typeof response === 'object' && response !== null) {
      const msg = (response as Record<string, unknown>).message;
      const err = (response as Record<string, unknown>).error;

      const message =
        typeof msg === 'string' || Array.isArray(msg) ? msg : defaultMsg;
      const errorLabel = typeof err === 'string' ? err : undefined;

      return { message, errorLabel };
    }

    return { message: defaultMsg };
  }
}
