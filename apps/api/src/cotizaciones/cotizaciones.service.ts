import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { cotizar } from '@bisa/motor-precios';
import type { EntradaCotizacion, ResultadoCotizacion } from '@bisa/motor-precios';
import type { PoolClient } from 'pg';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { UsuarioActual } from '../auth/auth.tipos';
import { sumarDiasHabiles } from '../comun/fechas';
import { Db } from '../db/db.service';
import { ParametroFaltanteError, SinTarifasVigentesError, TarifasService } from '../tarifas/tarifas.service';
import type { ContextoCalculo } from '../tarifas/tarifas.service';

const MONEDA: Record<string, 'USD' | 'BOB'> = { IG: 'USD', RM: 'BOB', AD: 'BOB', MB: 'USD', NP: 'USD' };
const VEN_TODAS = ['SUPERVISOR', 'AUDITOR'];

export interface ListaFiltros {
  estado?: string; q?: string; desde?: string; hasta?: string; limite: number; desplazamiento: number;
}

@Injectable()
export class CotizacionesService {
  constructor(private readonly db: Db, private readonly tarifas: TarifasService, private readonly auditoria: AuditoriaService) {}

  // ------------------------------------------------------------ cálculo
  private async contexto(q: Db | PoolClient): Promise<ContextoCalculo> {
    try {
      return await this.tarifas.cargar(q);
    } catch (e) {
      if (e instanceof SinTarifasVigentesError || e instanceof ParametroFaltanteError) {
        throw new ServiceUnavailableException({ mensaje: e.message, codigo: 'CONFIGURACION_INCOMPLETA' });
      }
      throw e;
    }
  }

  private ejecutar(entrada: EntradaCotizacion, ctx: ContextoCalculo): ResultadoCotizacion {
    const r = cotizar(entrada, ctx.paquete, ctx.parametros);
    if (!r.ok) throw new UnprocessableEntityException({ mensaje: 'La cotización no es válida', errores: r.errores });
    return r.resultado;
  }

  private advertencias(entrada: EntradaCotizacion, r: ResultadoCotizacion): string[] {
    const monedas = new Set(entrada.productos.map((p) => MONEDA[p]));
    return r.combinada && monedas.size > 1
      ? ['COMBINADA_MEZCLA_MONEDAS: la suma combinada suma Bs. y USD sin convertir, igual que el Excel (pendiente de decisión del negocio)']
      : [];
  }

  async calcular(entrada: EntradaCotizacion) {
    const ctx = await this.contexto(this.db);
    const resultado = this.ejecutar(entrada, ctx);
    return {
      versionTarifa: ctx.versionNombre,
      monedas: Object.fromEntries(entrada.productos.map((p) => [p, MONEDA[p]])),
      advertencias: this.advertencias(entrada, resultado),
      resultado,
    };
  }

  // ------------------------------------------------------------ guardar
  async guardar(u: UsuarioActual, titularNombre: string, entrada: EntradaCotizacion, ip?: string) {
    return this.db.tx(async (c) => {
      const ctx = await this.contexto(c);
      const resultado = this.ejecutar(entrada, ctx);
      const validaHasta = sumarDiasHabiles(ctx.fecha, ctx.validezDiasHabiles);

      const cat = await this.catalogos(c);
      const idPlan = (codigo: string) => {
        const id = cat.planes.get(codigo);
        if (!id) throw new UnprocessableEntityException({ mensaje: `El plan ${codigo} no existe o no está activo` });
        return id;
      };
      const mb = entrada.mundialBlue;
      const np = entrada.naranjaPlus;
      const cab = await c.query<{ id: string; numero: string }>(
        `INSERT INTO cotizacion (creada_por, valida_hasta, titular_nombre, region_id, aplica_sars, version_tarifa_id,
                                 redmax_plan_id, mb_plan_id, mb_numero_hijos, np_plan_id, entrada, parametros_usados, estado)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'CALCULADA') RETURNING id, numero`,
        [
          u.id, validaHasta, titularNombre, cat.regiones.get(entrada.regional), entrada.aplicaSars, ctx.versionId,
          entrada.redMax ? idPlan(entrada.redMax.plan) : null,
          mb ? idPlan(`MB_${mb.cobertura}_${mb.deducible}`) : null,
          mb?.numeroHijos ?? null,
          np ? idPlan(`NP_${cat.ambitoNP.get(np.ambito) ?? ''}_${np.valorAsegurado}_${np.deducible}`) : null,
          JSON.stringify(entrada), JSON.stringify({ fecha: ctx.fecha, version: ctx.versionNombre, ...ctx.parametrosUsados }),
        ],
      );
      const { id, numero } = cab.rows[0]!;

      for (const p of entrada.productos) {
        await c.query('INSERT INTO cotizacion_producto (cotizacion_id, producto_id) VALUES ($1,$2)', [id, cat.productos.get(p)]);
      }
      const idsAseg: string[] = [];
      for (const [i, a] of entrada.asegurados.entries()) {
        const r = await c.query<{ id: string }>(
          `INSERT INTO cotizacion_asegurado (cotizacion_id, orden, parentesco_id, edad, sexo, producto_elegido_id)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [id, i + 1, cat.parentescos.get(a.parentesco), a.edad, a.sexo, a.productoElegido ? cat.productos.get(a.productoElegido) : null],
        );
        idsAseg.push(r.rows[0]!.id);
      }
      for (const l of resultado.lineas) {
        await c.query(
          `INSERT INTO cotizacion_linea (cotizacion_id, asegurado_id, producto_id, estado, motivo, prima_base,
                                         recargo_maternidad, recargo_sars, prima_mensual, prima_mensual_sin_sars, detalle)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [id, idsAseg[l.aseguradoIdx], cat.productos.get(l.producto), l.estado, l.motivo ?? null,
           l.primaBase?.toString() ?? null, l.recargoMaternidad?.toString() ?? null, l.recargoSars?.toString() ?? null,
           l.primaMensual?.toString() ?? null, l.primaMensualSinSars?.toString() ?? null, JSON.stringify(l.detalle)],
        );
      }
      for (const t of resultado.totales) {
        await c.query(
          `INSERT INTO cotizacion_total (cotizacion_id, es_combinada, producto_id, mensual, anual, contado) VALUES ($1,false,$2,$3,$4,$5)`,
          [id, cat.productos.get(t.producto), t.mensual.toString(), t.anual.toString(), t.contado.toString()],
        );
      }
      if (resultado.combinada) {
        const t = resultado.combinada;
        await c.query(
          `INSERT INTO cotizacion_total (cotizacion_id, es_combinada, producto_id, mensual, anual, contado) VALUES ($1,true,NULL,$2,$3,$4)`,
          [id, t.mensual.toString(), t.anual.toString(), t.contado.toString()],
        );
      }
      await this.auditoria.registrar(c, { usuarioId: u.id, accion: 'COTIZACION_CREAR', entidad: 'cotizacion', entidadId: id, despues: { numero, version: ctx.versionNombre }, ip });
      return {
        id, numero, estado: 'CALCULADA', validaHasta, versionTarifa: ctx.versionNombre,
        advertencias: this.advertencias(entrada, resultado), resultado,
      };
    });
  }

  private async catalogos(c: PoolClient) {
    // Secuencial: una conexión de transacción no admite consultas simultáneas.
    const reg = await c.query<{ id: string; codigo: string }>('SELECT id, codigo FROM region');
    const pro = await c.query<{ id: string; codigo: string }>('SELECT id, codigo FROM producto');
    const par = await c.query<{ id: string; codigo: string }>('SELECT id, codigo FROM parentesco');
    const pla = await c.query<{ id: string; codigo: string }>('SELECT id, codigo FROM plan WHERE activo');
    const mapa = (r: { rows: { id: string; codigo: string }[] }) => new Map(r.rows.map((x) => [x.codigo, x.id]));
    return {
      regiones: mapa(reg), productos: mapa(pro), parentescos: mapa(par), planes: mapa(pla),
      ambitoNP: new Map([['BOLIVIA', 'L'], ['MUNDIAL_CON_BOLIVIA', 'MB']]),
    };
  }

  // ------------------------------------------------------------ consulta
  private alcance(u: UsuarioActual): { todas: boolean } {
    return { todas: u.roles.some((r) => VEN_TODAS.includes(r)) };
  }

  async listar(u: UsuarioActual, f: ListaFiltros) {
    const where: string[] = [];
    const p: unknown[] = [];
    const add = (sql: string, v: unknown) => { p.push(v); where.push(sql.replace('?', `$${p.length}`)); };
    if (!this.alcance(u).todas) add('c.creada_por = ?', u.id);
    if (f.estado) add('c.estado = ?::estado_cotizacion', f.estado);
    if (f.q) {
      p.push(f.q);
      where.push(`(lower(c.titular_nombre) LIKE '%' || lower($${p.length}) || '%' OR c.numero ILIKE '%' || $${p.length} || '%')`);
    }
    if (f.desde) add('c.creada_en >= ?::date', f.desde);
    if (f.hasta) add(`c.creada_en < (?::date + 1)`, f.hasta);
    p.push(f.limite, f.desplazamiento);
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const r = await this.db.query(
      `SELECT c.id, c.numero, c.titular_nombre AS "titularNombre", c.estado, c.creada_en AS "creadaEn",
              c.valida_hasta AS "validaHasta", u.email AS "creadaPor", count(*) OVER() AS total
         FROM cotizacion c JOIN usuario u ON u.id = c.creada_por ${w}
        ORDER BY c.creada_en DESC LIMIT $${p.length - 1} OFFSET $${p.length}`,
      p,
    );
    return { total: r.rows[0] ? Number(r.rows[0].total) : 0, items: r.rows.map(({ total, ...x }) => x) };
  }

  async obtener(u: UsuarioActual, id: string) {
    const c = await this.db.query(
      `SELECT c.id, c.numero, c.titular_nombre AS "titularNombre", c.estado, c.creada_en AS "creadaEn",
              to_char(c.valida_hasta,'YYYY-MM-DD') AS "validaHasta", c.aplica_sars AS "aplicaSars", c.entrada,
              c.parametros_usados AS "parametrosUsados", v.nombre AS "versionTarifa", us.email AS "creadaPor", c.creada_por AS "creadaPorId"
         FROM cotizacion c JOIN version_tarifa v ON v.id = c.version_tarifa_id JOIN usuario us ON us.id = c.creada_por
        WHERE c.id::text = $1`,
      [id],
    );
    const cab = c.rows[0];
    if (!cab || (!this.alcance(u).todas && cab.creadaPorId !== u.id)) throw new NotFoundException('Cotización no encontrada');
    const [aseg, lin, tot] = await Promise.all([
      this.db.query(
        `SELECT a.orden, pa.codigo AS parentesco, a.edad, a.sexo, pr.codigo AS "productoElegido"
           FROM cotizacion_asegurado a JOIN parentesco pa ON pa.id = a.parentesco_id LEFT JOIN producto pr ON pr.id = a.producto_elegido_id
          WHERE a.cotizacion_id = $1 ORDER BY a.orden`, [id]),
      this.db.query(
        `SELECT a.orden AS "aseguradoOrden", pr.codigo AS producto, l.estado, l.motivo, l.prima_base AS "primaBase",
                l.recargo_maternidad AS "recargoMaternidad", l.recargo_sars AS "recargoSars", l.prima_mensual AS "primaMensual",
                l.prima_mensual_sin_sars AS "primaMensualSinSars", l.detalle
           FROM cotizacion_linea l JOIN cotizacion_asegurado a ON a.id = l.asegurado_id JOIN producto pr ON pr.id = l.producto_id
          WHERE l.cotizacion_id = $1 ORDER BY a.orden, pr.codigo`, [id]),
      this.db.query(
        `SELECT pr.codigo AS producto, t.es_combinada AS "esCombinada", t.mensual, t.anual, t.contado
           FROM cotizacion_total t LEFT JOIN producto pr ON pr.id = t.producto_id WHERE t.cotizacion_id = $1 ORDER BY t.es_combinada, pr.codigo`, [id]),
    ]);
    const { creadaPorId, ...cabecera } = cab;
    return {
      ...cabecera, asegurados: aseg.rows, lineas: lin.rows,
      totales: tot.rows.filter((t) => !t.esCombinada), combinada: tot.rows.find((t) => t.esCombinada) ?? null,
    };
  }

  // ------------------------------------------------------------ ciclo de vida
  async emitir(u: UsuarioActual, id: string, ip?: string) {
    return this.db.tx(async (c) => {
      const r = await c.query<{ estado: string; vencida: boolean; creada_por: string }>(
        `SELECT estado, valida_hasta < current_date AS vencida, creada_por FROM cotizacion WHERE id::text = $1 FOR UPDATE`, [id]);
      const cot = r.rows[0];
      if (!cot || cot.creada_por !== u.id) throw new NotFoundException('Cotización no encontrada');
      if (cot.estado !== 'CALCULADA') throw new ConflictException(`La cotización está ${cot.estado} y no puede emitirse`);
      if (cot.vencida) throw new ConflictException('La cotización venció; debe recalcularse con las tarifas vigentes');
      await c.query(`UPDATE cotizacion SET estado = 'EMITIDA' WHERE id = $1`, [id]);
      await this.auditoria.registrar(c, { usuarioId: u.id, accion: 'COTIZACION_EMITIR', entidad: 'cotizacion', entidadId: id, antes: { estado: 'CALCULADA' }, despues: { estado: 'EMITIDA' }, ip });
      return { id, estado: 'EMITIDA' };
    });
  }

  async anular(u: UsuarioActual, id: string, motivo: string, ip?: string) {
    return this.db.tx(async (c) => {
      const r = await c.query<{ estado: string; creada_por: string }>(`SELECT estado, creada_por FROM cotizacion WHERE id::text = $1 FOR UPDATE`, [id]);
      const cot = r.rows[0];
      const esSupervisor = u.roles.includes('SUPERVISOR');
      if (!cot || (cot.creada_por !== u.id && !esSupervisor)) throw new NotFoundException('Cotización no encontrada');
      if (cot.estado === 'ANULADA') throw new ConflictException('La cotización ya está anulada');
      await c.query(`UPDATE cotizacion SET estado = 'ANULADA' WHERE id = $1`, [id]);
      await this.auditoria.registrar(c, { usuarioId: u.id, accion: 'COTIZACION_ANULAR', entidad: 'cotizacion', entidadId: id, antes: { estado: cot.estado }, despues: { estado: 'ANULADA', motivo }, ip });
      return { id, estado: 'ANULADA' };
    });
  }

  // ------------------------------------------------------------ catálogos para la pantalla
  async catalogo() {
    const [reg, pro, pla, par] = await Promise.all([
      this.db.query(`SELECT codigo, nombre FROM region WHERE activa ORDER BY orden`),
      this.db.query(`SELECT codigo, nombre, moneda_prima AS moneda FROM producto WHERE activo ORDER BY codigo`),
      this.db.query(`SELECT p.codigo, p.nombre, pr.codigo AS producto, p.ambito, p.valor_asegurado AS "valorAsegurado", p.deducible
                       FROM plan p JOIN producto pr ON pr.id = p.producto_id WHERE p.activo ORDER BY pr.codigo, p.valor_asegurado, p.deducible`),
      this.db.query(`SELECT codigo, nombre, max_por_cotizacion AS maximo, permite_maternidad AS "permiteMaternidad" FROM parentesco ORDER BY orden`),
    ]);
    return { regiones: reg.rows, productos: pro.rows, planes: pla.rows, parentescos: par.rows };
  }
}
