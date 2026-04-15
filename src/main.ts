import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  BadRequestException,
  HttpStatus,
  UnprocessableEntityException,
  ValidationPipe,
} from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '127.0.0.1';

  app.enableCors({ origin: '*' });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      exceptionFactory: (errors: ValidationError[]) => {
        const hasTypeError = errors.some((error) =>
          Object.hasOwn(error.constraints ?? {}, 'isString'),
        );

        const hasEmptyNameError = errors.some((error) =>
          Object.hasOwn(error.constraints ?? {}, 'isNotEmpty'),
        );

        if (hasTypeError) {
          return new UnprocessableEntityException('Invalid type');
        }

        if (hasEmptyNameError) {
          return new BadRequestException('Name is required');
        }

        return new BadRequestException('Bad Request');
      },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  await app.listen(port, host);
}
bootstrap();
