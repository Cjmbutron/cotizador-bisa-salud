import { Controller, Get, Header, HttpCode, Param, Post, Req, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { SolicitudAutenticada, UsuarioActual } from '../auth/auth.tipos';
import { Roles, Usuario } from '../auth/decoradores';
import { DocumentosService } from './documentos.service';

@Controller()
export class DocumentosController {
  constructor(private readonly svc: DocumentosService) {}

  /** Genera la propuesta en PDF de un producto de la cotización y devuelve el archivo. */
  @Post('cotizaciones/:id/documentos/:producto')
  @HttpCode(200)
  @Roles('COMERCIAL', 'SUPERVISOR', 'AUDITOR')
  async generar(
    @Usuario() u: UsuarioActual, @Param('id') id: string, @Param('producto') producto: string,
    @Req() req: SolicitudAutenticada, @Res({ passthrough: true }) res: Response,
  ) {
    const d = await this.svc.generar(u, id, producto.toUpperCase(), req.ip);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="propuesta.pdf"; filename*=UTF-8''${encodeURIComponent(d.archivo)}`,
      'X-Archivo': encodeURIComponent(d.archivo),
      'X-Hash-Sha256': d.hash,
      'X-Texto-Provisional': String(d.textoProvisional),
      'Access-Control-Expose-Headers': 'Content-Disposition, X-Archivo, X-Hash-Sha256, X-Texto-Provisional',
      'Cache-Control': 'no-store',
    });
    return new StreamableFile(d.buffer);
  }

  @Get('cotizaciones/:id/documentos')
  @Header('Cache-Control', 'no-store')
  @Roles('COMERCIAL', 'SUPERVISOR', 'AUDITOR')
  historial(@Usuario() u: UsuarioActual, @Param('id') id: string) {
    return this.svc.historial(u, id);
  }

  // ---------------- revisión comercial del texto de las plantillas
  @Get('admin/plantillas')
  @Roles('REVISOR_COMERCIAL', 'ADMIN_TI', 'AUDITOR')
  listar() {
    return this.svc.listarPlantillas();
  }

  @Post('admin/plantillas/:id/aprobar')
  @HttpCode(200)
  @Roles('REVISOR_COMERCIAL')
  aprobar(@Usuario() u: UsuarioActual, @Param('id') id: string, @Req() req: SolicitudAutenticada) {
    return this.svc.aprobar(u, id, req.ip);
  }

  @Post('admin/plantillas/:id/revocar')
  @HttpCode(200)
  @Roles('REVISOR_COMERCIAL')
  revocar(@Usuario() u: UsuarioActual, @Param('id') id: string, @Req() req: SolicitudAutenticada) {
    return this.svc.revocar(u, id, req.ip);
  }
}
