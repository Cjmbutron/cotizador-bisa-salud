import { Global, Module } from '@nestjs/common';
import { CONFIG, Config, cargarConfig } from './config';

/** Permite inyectar una configuración distinta en pruebas con ConfigModule.con(...). */
@Global()
@Module({})
export class ConfigModule {
  static con(config: Config = cargarConfig()) {
    return { module: ConfigModule, providers: [{ provide: CONFIG, useValue: config }], exports: [CONFIG] };
  }
}
