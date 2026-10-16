import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import type { EntradaCotizacion } from '@bisa/motor-precios';
import { UsuarioActual, SolicitudAutenticada } from '../auth/auth.tipos';
import { Roles, Usuario } from '../auth/decoradores';
import { CotizacionesService } from './cotizaciones.service';
import { anularSchema, entradaSchema, guardarSchema, leer, listarSchema } from './dto';

@Controller()
export class CotizacionesController {
  constructor(private readonly svc: CotizacionesService) {}

  @Get('catalogo')
  catalogo() {
    return this.svc.catalogo();
  }

  /** Calcula sin guardar (para ver el resultado mientras se completa el formulario). */
  @Post('cotizaciones/calcular')
  @HttpCode(200)
  @Roles('COMERCIAL', 'SUPERVISOR')
  calcular(@Body() body: unknown) {
    return this.svc.calcular(leer(entradaSchema, body) as EntradaCotizacion);
  }

  @Post('cotizaciones')
  @Roles('COMERCIAL')
  guardar(@Usuario() u: UsuarioActual, @Body() body: unknown, @Req() req: SolicitudAutenticada) {
    const d = leer(guardarSchema, body);
    return this.svc.guardar(u, d.titularNombre, d.entrada as EntradaCotizacion, req.ip);
  }

  @Get('cotizaciones')
  @Roles('COMERCIAL', 'SUPERVISOR', 'AUDITOR')
  listar(@Usuario() u: UsuarioActual, @Query() query: unknown) {
    return this.svc.listar(u, leer(listarSchema, query));
  }

  @Get('cotizaciones/:id')
  @Roles('COMERCIAL', 'SUPERVISOR', 'AUDITOR')
  obtener(@Usuario() u: UsuarioActual, @Param('id') id: string) {
    return this.svc.obtener(u, id);
  }

  @Post('cotizaciones/:id/emitir')
  @HttpCode(200)
  @Roles('COMERCIAL')
  emitir(@Usuario() u: UsuarioActual, @Param('id') id: string, @Req() req: SolicitudAutenticada) {
    return this.svc.emitir(u, id, req.ip);
  }

  @Post('cotizaciones/:id/anular')
  @HttpCode(200)
  @Roles('COMERCIAL', 'SUPERVISOR')
  anular(@Usuario() u: UsuarioActual, @Param('id') id: string, @Body() body: unknown, @Req() req: SolicitudAutenticada) {
    return this.svc.anular(u, id, leer(anularSchema, body).motivo, req.ip);
  }
}
