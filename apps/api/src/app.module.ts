import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditoriaModule } from './auditoria/auditoria.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './comun/health.controller';
import { MeController } from './comun/me.controller';
import { Config, cargarConfig } from './config/config';
import { ConfigModule } from './config/config.module';
import { AdminModule } from './admin/admin.module';
import { CotizacionesModule } from './cotizaciones/cotizaciones.module';
import { DocumentosModule } from './documentos/documentos.module';
import { DbModule } from './db/db.module';

@Module({})
export class AppModule {
  static con(config: Config = cargarConfig()): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.con(config),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: config.RATE_LIMIT_POR_MINUTO }]),
        DbModule, AuditoriaModule, AuthModule, CotizacionesModule, AdminModule, DocumentosModule,
      ],
      controllers: [HealthController, MeController],
      // Limitación de peticiones por IP, global (incluye /health).
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    };
  }
}
