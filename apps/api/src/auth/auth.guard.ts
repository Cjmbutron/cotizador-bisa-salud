import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Db } from '../db/db.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { SolicitudAutenticada, RolCodigo } from './auth.tipos';
import { VerificadorToken } from './verificador';
import { PUBLICO, ROLES } from './decoradores';

/** Autentica (token válido) y autoriza (usuario activo con alguno de los roles requeridos). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verificador: VerificadorToken,
    private readonly db: Db,
    private readonly auditoria: AuditoriaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const destinos = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLICO, destinos)) return true;

    const req = ctx.switchToHttp().getRequest<SolicitudAutenticada>();
    const cabecera = req.headers.authorization ?? '';
    const [esquema, token] = cabecera.split(' ');
    if (esquema !== 'Bearer' || !token) throw new UnauthorizedException('Falta el token de acceso');

    let correo: string;
    try {
      correo = await this.verificador.correoDe(token);
    } catch {
      throw new UnauthorizedException('Token inválido o vencido');
    }

    const r = await this.db.query<{ id: string; email: string; nombre: string; activo: boolean; roles: RolCodigo[] }>(
      `SELECT u.id, u.email, u.nombre, u.activo,
              coalesce(array_agg(r.codigo) FILTER (WHERE r.codigo IS NOT NULL), '{}') AS roles
         FROM usuario u
         LEFT JOIN usuario_rol ur ON ur.usuario_id = u.id
         LEFT JOIN rol r ON r.id = ur.rol_id
        WHERE lower(u.email) = $1
        GROUP BY u.id`,
      [correo],
    );
    const u = r.rows[0];
    if (!u || !u.activo) {
      await this.auditoria.registrar(this.db, { usuarioId: u?.id ?? null, accion: 'ACCESO_DENEGADO', entidad: 'usuario', entidadId: u?.id ?? null, despues: { motivo: u ? 'inactivo' : 'no registrado' }, ip: req.ip });
      throw new ForbiddenException('El usuario no tiene acceso al sistema');
    }

    const requeridos = this.reflector.getAllAndOverride<RolCodigo[]>(ROLES, destinos);
    if (requeridos?.length && !requeridos.some((x) => u.roles.includes(x))) {
      throw new ForbiddenException('No tiene permiso para esta operación');
    }
    req.usuario = { id: u.id, email: u.email, nombre: u.nombre, roles: u.roles };
    this.db.query('UPDATE usuario SET ultimo_acceso = now() WHERE id = $1', [u.id]).catch(() => undefined);
    return true;
  }
}
