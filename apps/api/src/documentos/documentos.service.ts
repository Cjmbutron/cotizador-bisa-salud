import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { UsuarioActual } from '../auth/auth.tipos';
import { CotizacionesService } from '../cotizaciones/cotizaciones.service';
import { Db } from '../db/db.service';
import { claveDePlantilla, conMaternidad } from './contexto';
import type { DatosPropuesta } from './contexto';
import { cotizadorVirtual } from './contexto';
import { DIR_PLANTILLAS, cargarPlantilla } from './plantilla';
import { PdfService } from './pdf.service';
import { renderizarHtml } from './render';

export const MARCA_PROVISIONAL = 'TEXTO PROVISIONAL\nPENDIENTE DE REVISIÓN COMERCIAL';

const hashDe = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

/** Quita lo que no sirve en un nombre de archivo (Windows y URL). */
export function nombreSeguro(s: string): string {
  return s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Propuesta';
}

export function hashContenidoPlantilla(clave: string): string {
  return hashDe(readFileSync(join(DIR_PLANTILLAS, `${clave}.json`)));
}

@Injectable()
export class DocumentosService {
  constructor(
    private readonly db: Db,
    private readonly cotizaciones: CotizacionesService,
    private readonly pdf: PdfService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async generar(u: UsuarioActual, id: string, producto: string, ip?: string) {
    const cot = await this.cotizaciones.obtener(u, id);
    if (cot.estado === 'ANULADA') throw new ConflictException('La cotización está anulada y no genera propuesta');
    const datos = { ...cot, entrada: cot.entrada } as unknown as DatosPropuesta;
    if (!datos.entrada.productos.includes(producto as never)) {
      throw new UnprocessableEntityException({ mensaje: `La cotización no incluye el producto ${producto}`, codigo: 'PRODUCTO_NO_COTIZADO' });
    }

    const clave = claveDePlantilla(datos, producto);
    const pl = await this.db.query<{ id: string; texto_aprobado: boolean; hash_aprobado: string | null; nombre: string }>(
      `SELECT d.id, d.texto_aprobado, d.hash_aprobado, p.nombre
         FROM plantilla_documento d JOIN producto p ON p.id = d.producto_id
        WHERE d.archivo = $1 AND d.activa ORDER BY d.version DESC LIMIT 1`, [clave]);
    const fila = pl.rows[0];
    if (!fila) throw new UnprocessableEntityException({ mensaje: `No hay plantilla activa para ${clave}`, codigo: 'PLANTILLA_NO_ENCONTRADA' });
    // La aprobación vale solo para el contenido exacto que se aprobó.
    const aprobada = fila.texto_aprobado && fila.hash_aprobado === hashContenidoPlantilla(clave);

    const plantilla = cargarPlantilla(clave);
    const hoy = new Date();
    const { html, anchoPx } = renderizarHtml(plantilla, cotizadorVirtual(datos, producto), {
      hoy, marcaAgua: aprobada ? undefined : MARCA_PROVISIONAL,
    });
    const buffer = await this.pdf.generar(html, anchoPx, `${cot.numero} · Tarifas ${cot.versionTarifa}${aprobada ? '' : ' · TEXTO PROVISIONAL, PENDIENTE DE REVISIÓN COMERCIAL'}`);
    const hash = hashDe(buffer);
    const archivo = `${nombreSeguro(cot.titularNombre)} - ${nombreSeguro(fila.nombre)}${conMaternidad(datos) && producto !== 'NP' ? ' CON MATERNIDAD' : ''}.pdf`;

    await this.db.tx(async (c) => {
      await c.query(
        `INSERT INTO cotizacion_documento (cotizacion_id, plantilla_id, archivo, hash_sha256, generado_por) VALUES ($1,$2,$3,$4,$5)`,
        [id, fila.id, archivo, hash, u.id]);
      await this.auditoria.registrar(c, {
        usuarioId: u.id, accion: 'DOCUMENTO_GENERAR', entidad: 'cotizacion', entidadId: id,
        despues: { producto, plantilla: clave, archivo, hash, textoAprobado: aprobada }, ip,
      });
    });
    return { buffer, archivo, hash, textoProvisional: !aprobada, plantilla: clave };
  }

  async historial(u: UsuarioActual, id: string) {
    await this.cotizaciones.obtener(u, id); // valida el alcance del usuario
    const r = await this.db.query(
      `SELECT d.archivo, d.hash_sha256 AS hash, d.generado_en AS "generadoEn", us.email AS "generadoPor", p.archivo AS plantilla
         FROM cotizacion_documento d JOIN usuario us ON us.id = d.generado_por JOIN plantilla_documento p ON p.id = d.plantilla_id
        WHERE d.cotizacion_id::text = $1 ORDER BY d.generado_en DESC`, [id]);
    return r.rows;
  }

  // ------------------------------------------------------------ revisión comercial de las plantillas
  async listarPlantillas() {
    const r = await this.db.query<{ id: string; clave: string; producto: string; variante: string | null; conMaternidad: boolean | null; version: number; textoAprobado: boolean; hashAprobado: string | null; aprobadoEn: Date | null; aprobadoPor: string | null }>(
      `SELECT d.id, d.archivo AS clave, p.codigo AS producto, d.variante, d.con_maternidad AS "conMaternidad", d.version,
              d.texto_aprobado AS "textoAprobado", d.hash_aprobado AS "hashAprobado", d.aprobado_en AS "aprobadoEn", u.email AS "aprobadoPor"
         FROM plantilla_documento d JOIN producto p ON p.id = d.producto_id LEFT JOIN usuario u ON u.id = d.aprobado_por
        WHERE d.activa ORDER BY p.codigo, d.variante NULLS FIRST, d.con_maternidad NULLS FIRST`);
    return r.rows.map((x) => {
      const vigente = x.textoAprobado && x.hashAprobado === hashContenidoPlantilla(x.clave);
      const { hashAprobado, ...resto } = x;
      return { ...resto, textoAprobado: vigente, aprobacionCaducada: x.textoAprobado && !vigente };
    });
  }

  async aprobar(u: UsuarioActual, id: string, ip?: string) {
    return this.db.tx(async (c) => {
      const r = await c.query<{ archivo: string }>(`SELECT archivo FROM plantilla_documento WHERE id::text = $1 AND activa FOR UPDATE`, [id]);
      if (!r.rows[0]) throw new NotFoundException('Plantilla no encontrada');
      const hash = hashContenidoPlantilla(r.rows[0].archivo);
      await c.query(
        `UPDATE plantilla_documento SET texto_aprobado = true, aprobado_por = $2, aprobado_en = now(), hash_aprobado = $3 WHERE id::text = $1`,
        [id, u.id, hash]);
      await this.auditoria.registrar(c, { usuarioId: u.id, accion: 'PLANTILLA_APROBAR', entidad: 'plantilla_documento', entidadId: id, despues: { clave: r.rows[0].archivo, hash }, ip });
      return { id, clave: r.rows[0].archivo, textoAprobado: true };
    });
  }

  async revocar(u: UsuarioActual, id: string, ip?: string) {
    return this.db.tx(async (c) => {
      const r = await c.query<{ archivo: string }>(`SELECT archivo FROM plantilla_documento WHERE id::text = $1 AND activa FOR UPDATE`, [id]);
      if (!r.rows[0]) throw new NotFoundException('Plantilla no encontrada');
      await c.query(`UPDATE plantilla_documento SET texto_aprobado = false, aprobado_por = NULL, aprobado_en = NULL, hash_aprobado = NULL WHERE id::text = $1`, [id]);
      await this.auditoria.registrar(c, { usuarioId: u.id, accion: 'PLANTILLA_REVOCAR', entidad: 'plantilla_documento', entidadId: id, despues: { clave: r.rows[0].archivo }, ip });
      return { id, clave: r.rows[0].archivo, textoAprobado: false };
    });
  }
}
