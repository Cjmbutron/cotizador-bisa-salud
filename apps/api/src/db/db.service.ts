import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { CONFIG, Config } from '../config/config';
import { configSsl } from './ssl';

export interface Consulta {
  query<R extends QueryResultRow = any>(sql: string, params?: unknown[]): Promise<QueryResult<R>>;
}

@Injectable()
export class Db implements Consulta, OnModuleDestroy {
  readonly pool: Pool;

  constructor(@Inject(CONFIG) cfg: Config) {
    // La zona horaria se fija al abrir la conexión para que "hoy" sea el del negocio.
    this.pool = new Pool({
      ...configSsl(cfg.DATABASE_URL, cfg.DB_SSL, cfg.DB_SSL_CA),
      max: cfg.DB_POOL_MAX,
    });
    // Se fija con SET en cada conexión nueva (y no como opción de arranque) para funcionar también detrás de un pooler (Supabase).
    const zona = cfg.ZONA_NEGOCIO.replace(/[^A-Za-z0-9_/+-]/g, '');
    this.pool.on('connect', (c) => { void c.query(`SET TIME ZONE '${zona}'`); });
  }

  query<R extends QueryResultRow = any>(sql: string, params: unknown[] = []) {
    return this.pool.query<R>(sql, params);
  }

  /** Ejecuta fn dentro de una transacción; confirma si termina bien, revierte si lanza. */
  async tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const r = await fn(c);
      await c.query('COMMIT');
      return r;
    } catch (e) {
      await c.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      c.release();
    }
  }

  onModuleDestroy() {
    return this.pool.end();
  }
}
