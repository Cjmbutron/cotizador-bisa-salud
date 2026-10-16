import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/** Una línea por petición. No registra cuerpos (llevan nombres y edades de personas). */
export function registroPeticiones(req: Request, res: Response, next: NextFunction) {
  const t0 = Date.now();
  res.on('finish', () => {
    new Logger('HTTP').log(`${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${Date.now() - t0}ms`);
  });
  next();
}
