import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Req } from '@nestjs/common';
import { SolicitudAutenticada, UsuarioActual } from '../auth/auth.tipos';
import { Roles, Usuario } from '../auth/decoradores';
import { leer } from '../cotizaciones/dto';
import { crearVersionSchema, devolverSchema, hijosSchema, parametroSchema, tarifasSchema } from './dto';
import { TarifasAdminService } from './tarifas-admin.service';

/**
 * Administración de tarifas y parámetros. Separación de funciones:
 *  - ADMIN_TARIFAS prepara (crea, edita el borrador, lo envía a revisión);
 *  - APROBADOR_TARIFAS revisa, devuelve o publica, y nunca sobre lo que él mismo creó.
 */
@Controller('admin')
export class TarifasAdminController {
  constructor(private readonly svc: TarifasAdminService) {}

  @Get('tarifas/versiones')
  @Roles('ADMIN_TARIFAS', 'APROBADOR_TARIFAS', 'AUDITOR')
  listar() { return this.svc.listar(); }

  @Post('tarifas/versiones')
  @Roles('ADMIN_TARIFAS')
  crear(@Usuario() u: UsuarioActual, @Body() b: unknown, @Req() r: SolicitudAutenticada) {
    return this.svc.crear(u, leer(crearVersionSchema, b), r.ip);
  }

  @Put('tarifas/versiones/:id/tarifas')
  @Roles('ADMIN_TARIFAS')
  guardarTarifas(@Usuario() u: UsuarioActual, @Param('id') id: string, @Body() b: unknown, @Req() r: SolicitudAutenticada) {
    return this.svc.guardarTarifas(u, id, leer(tarifasSchema, b).filas, r.ip);
  }

  @Put('tarifas/versiones/:id/tarifas-hijo')
  @Roles('ADMIN_TARIFAS')
  guardarHijos(@Usuario() u: UsuarioActual, @Param('id') id: string, @Body() b: unknown, @Req() r: SolicitudAutenticada) {
    return this.svc.guardarHijos(u, id, leer(hijosSchema, b).filas, r.ip);
  }

  @Get('tarifas/versiones/:id/revision')
  @Roles('ADMIN_TARIFAS', 'APROBADOR_TARIFAS')
  revision(@Param('id') id: string) { return this.svc.revision(id); }

  @Get('tarifas/versiones/:id/comparacion')
  @Roles('ADMIN_TARIFAS', 'APROBADOR_TARIFAS', 'AUDITOR')
  comparar(@Param('id') id: string, @Query('con') con?: string) { return this.svc.comparar(id, con); }

  @Post('tarifas/versiones/:id/enviar-revision')
  @HttpCode(200)
  @Roles('ADMIN_TARIFAS')
  enviar(@Usuario() u: UsuarioActual, @Param('id') id: string, @Req() r: SolicitudAutenticada) { return this.svc.enviarRevision(u, id, r.ip); }

  @Post('tarifas/versiones/:id/devolver')
  @HttpCode(200)
  @Roles('APROBADOR_TARIFAS')
  devolver(@Usuario() u: UsuarioActual, @Param('id') id: string, @Body() b: unknown, @Req() r: SolicitudAutenticada) {
    return this.svc.devolver(u, id, leer(devolverSchema, b).motivo, r.ip);
  }

  @Post('tarifas/versiones/:id/publicar')
  @HttpCode(200)
  @Roles('APROBADOR_TARIFAS')
  publicar(@Usuario() u: UsuarioActual, @Param('id') id: string, @Req() r: SolicitudAutenticada) { return this.svc.publicar(u, id, r.ip); }

  @Get('parametros')
  @Roles('ADMIN_TARIFAS', 'APROBADOR_TARIFAS', 'AUDITOR')
  parametros() { return this.svc.listarParametros(); }

  @Post('parametros')
  @Roles('ADMIN_TARIFAS')
  cambiarParametro(@Usuario() u: UsuarioActual, @Body() b: unknown, @Req() r: SolicitudAutenticada) {
    return this.svc.cambiarParametro(u, leer(parametroSchema, b), r.ip);
  }
}
