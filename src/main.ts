import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RequestMethod } from '@nestjs/common';
import {
    BadRequestException,
    Logger,
    UnprocessableEntityException,
    ValidationPipe,
} from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { Request, Response, NextFunction } from 'express';

async function bootstrap() {
    const logger = new Logger('Bootstrap');
    const app = await NestFactory.create(AppModule);
    const port = Number(process.env.PORT ?? 3000);
    const host = process.env.HOST ?? '0.0.0.0';

    app.enableCors({ origin: '*' });
    app.setGlobalPrefix('api');
    app.use((req: Request, res: Response, next: NextFunction) => {
        const startedAt = Date.now();

        res.on('finish', () => {
            const durationMs = Date.now() - startedAt;
            logger.log(
                `${req.method} ${req.originalUrl} ${res.statusCode} - ${durationMs}ms`,
            );
        });

        next();
    });
    app.useGlobalPipes(
        new ValidationPipe({
            transform: true,
            whitelist: true,
            forbidNonWhitelisted: true,
            exceptionFactory: (errors: ValidationError[]) => {
                const firstError = errors[0];
                const constraints = firstError.constraints ?? {};

                if (constraints.isNotEmpty) {
                    return new BadRequestException('Name is required');
                }

                return new UnprocessableEntityException(
                    'Invalid query parameters',
                );
            },
        }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());

    await app.listen(port, host);
    logger.log(`Application listening on http://${host}:${port}/api`);
}
void bootstrap();
