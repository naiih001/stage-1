import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      const message = this.getMessage(exceptionResponse, exception.message);

      this.logger.warn(
        `${request.method} ${request.originalUrl} -> ${statusCode}: ${message}`,
      );

      response.status(statusCode).json({
        status: 'error',
        message,
      });
      return;
    }

    this.logger.error(
      `${request.method} ${request.originalUrl} -> 500: Internal server error`,
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      status: 'error',
      message: 'Internal server error',
    });
  }

  private getMessage(
    exceptionResponse: string | object,
    fallbackMessage: string,
  ): string {
    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }

    if (
      exceptionResponse &&
      typeof exceptionResponse === 'object' &&
      'message' in exceptionResponse
    ) {
      const message = exceptionResponse.message;
      if (Array.isArray(message)) {
        return message[0] ?? fallbackMessage;
      }
      if (typeof message === 'string') {
        return message;
      }
    }

    return fallbackMessage;
  }
}
