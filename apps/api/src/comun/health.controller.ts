import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Publico } from '../auth/decoradores';
import { Db } from '../db/db.service';

@Controller('health')
export class HealthController {
  constructor(private readonly db: Db) {}

  /** Sin datos de negocio ni de configuración: solo dice si la API y la base responden. */
  @Publico()
  @Get()
  async estado() {
    try {
      await this.db.query('SELECT 1');
      return { estado: 'ok' };
    } catch {
      throw new ServiceUnavailableException({ estado: 'base_de_datos_no_disponible' });
    }
  }
}
