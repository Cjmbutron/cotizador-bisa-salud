import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { FiltroErrores } from './comun/filtro-errores';
import { registroPeticiones } from './comun/registro-peticiones';
import { Config } from './config/config';

export async function crearApp(config: Config, opts: { logger?: false } = {}): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.con(config), { logger: opts.logger === false ? false : undefined, bodyParser: true });
  app.useBodyParser('json', { limit: '100kb' });
  app.set('trust proxy', config.TRUST_PROXY);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(registroPeticiones);
  const origenes = config.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  app.enableCors({ origin: origenes, methods: ["GET", "POST", "PUT"], allowedHeaders: ['Authorization', 'Content-Type'] });
  app.useGlobalFilters(new FiltroErrores());
  app.enableShutdownHooks();
  return app;
}
