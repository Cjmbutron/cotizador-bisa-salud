import { Injectable } from '@nestjs/common';
import { Consulta } from '../db/db.service';

export interface EventoAuditoria {
  usuarioId: string | null;
  accion: string;
  entidad: string;
  entidadId: string | null;
  antes?: unknown;
  despues?: unknown;
  ip?: string;
}

@Injectable()
export class AuditoriaService {
  /** Recibe la conexión/transacción para que el registro se confirme o revierta junto con el cambio. */
  async registrar(q: Consulta, e: EventoAuditoria): Promise<void> {
    await q.query(
      `INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, antes, despues, ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        e.usuarioId, e.accion, e.entidad, e.entidadId,
        e.antes === undefined ? null : JSON.stringify(e.antes),
        e.despues === undefined ? null : JSON.stringify(e.despues),
        ipValida(e.ip),
      ],
    );
  }
}

function ipValida(ip?: string): string | null {
  return ip && /^[0-9a-fA-F:.]+$/.test(ip) ? ip : null;
}
