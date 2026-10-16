import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { RolCodigo, SolicitudAutenticada, UsuarioActual } from './auth.tipos';

export const PUBLICO = 'publico';
export const ROLES = 'roles';

/** Ruta sin autenticación (solo /health). */
export const Publico = () => SetMetadata(PUBLICO, true);
/** El usuario debe tener AL MENOS UNO de estos roles. Sin decorador: basta con estar activo. */
export const Roles = (...roles: RolCodigo[]) => SetMetadata(ROLES, roles);
export const Usuario = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): UsuarioActual => ctx.switchToHttp().getRequest<SolicitudAutenticada>().usuario!,
);
