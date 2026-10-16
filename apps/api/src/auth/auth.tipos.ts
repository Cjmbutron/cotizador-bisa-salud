import type { Request } from 'express';

export type RolCodigo = 'COMERCIAL' | 'SUPERVISOR' | 'ADMIN_TARIFAS' | 'APROBADOR_TARIFAS' | 'AUDITOR' | 'ADMIN_TI' | 'REVISOR_COMERCIAL';

export interface UsuarioActual {
  id: string;
  email: string;
  nombre: string;
  roles: RolCodigo[];
}

export type SolicitudAutenticada = Request & { usuario?: UsuarioActual };
