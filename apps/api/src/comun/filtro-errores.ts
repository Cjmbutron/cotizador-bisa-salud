import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';

/** Ningún error interno (SQL, rutas, trazas) llega al cliente. */
@Catch()
export class FiltroErrores implements ExceptionFilter {
  private readonly log = new Logger('Errores');

  catch(e: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (e instanceof HttpException) {
      const cuerpo = e.getResponse();
      return res.status(e.getStatus()).json(typeof cuerpo === 'string' ? { mensaje: cuerpo } : stripNest(cuerpo));
    }
    // Errores de lectura del cuerpo (JSON mal formado, demasiado grande): el cliente se equivocó, no el servidor.
    const http = (e as { status?: number; statusCode?: number; type?: string } | null) ?? {};
    const estado = http.status ?? http.statusCode;
    if (typeof estado === 'number' && estado >= 400 && estado < 500 && typeof http.type === 'string') {
      const mensaje = estado === 413 ? 'El cuerpo de la petición es demasiado grande' : 'Petición mal formada';
      return res.status(estado).json({ mensaje });
    }
    this.log.error(e instanceof Error ? e.stack ?? e.message : String(e));
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ mensaje: 'Error interno del servidor' });
  }
}

function stripNest(c: object): object {
  const { statusCode: _s, error: _e, message, ...resto } = c as Record<string, unknown>;
  return message !== undefined && !('mensaje' in resto) ? { mensaje: message, ...resto } : resto;
}
