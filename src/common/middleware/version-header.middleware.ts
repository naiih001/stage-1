import { Injectable, NestMiddleware, BadRequestException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class VersionHeaderMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const version = req.headers['x-api-version'];

    if (version !== '1') {
      throw new BadRequestException('API version header required');
    }

    next();
  }
}
