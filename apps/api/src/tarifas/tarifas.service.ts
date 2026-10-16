import { Injectable } from '@nestjs/common';
import { PARAMETROS_INICIALES } from '@bisa/motor-precios';
import type { AmbitoNP, PaqueteTarifas, Parametros, PlanRedMax, Regional, SexoTarifa } from '@bisa/motor-precios';
import { Consulta, Db } from '../db/db.service';

export class SinTarifasVigentesError extends Error {
  constructor(fecha: string) {
    super(`No hay una versión de tarifas publicada y vigente al ${fecha}`);
  }
}
export class ParametroFaltanteError extends Error {}

export interface ContextoCalculo {
  fecha: string;
  versionId: string;
  versionNombre: string;
  paquete: PaqueteTarifas;
  parametros: Parametros;
  /** Valores de parámetros tal como se usaron (se guardan con la cotización). */
  parametrosUsados: Record<string, unknown>;
  validezDiasHabiles: number;
}

const EDADES = 100; // 0..99
const REGIONALES: Regional[] = ['LPZ', 'CBBA', 'SCZ', 'CHQ', 'TJA'];
const vacio = () => Array<number | null>(EDADES).fill(null);

@Injectable()
export class TarifasService {
  /** Una versión publicada no cambia (lo garantiza la base), por eso se puede conservar en memoria. */
  private readonly cache = new Map<string, PaqueteTarifas>();

  constructor(private readonly db: Db) {}

  /** Fecha de hoy en la zona horaria del negocio (la sesión ya está configurada con ella). */
  async hoy(q: Consulta = this.db): Promise<string> {
    const r = await q.query<{ hoy: string }>(`SELECT to_char(current_date, 'YYYY-MM-DD') AS hoy`);
    return r.rows[0]!.hoy;
  }

  async cargar(q: Consulta = this.db, fecha?: string): Promise<ContextoCalculo> {
    const f = fecha ?? (await this.hoy(q));
    const v = await q.query<{ id: string; nombre: string }>(
      `SELECT id, nombre FROM version_tarifa
        WHERE estado = 'PUBLICADA' AND vigente_desde <= $1::date
          AND (vigente_hasta IS NULL OR vigente_hasta > $1::date)`,
      [f],
    );
    if (v.rowCount === 0) throw new SinTarifasVigentesError(f);
    const { id, nombre } = v.rows[0]!;

    let paquete = this.cache.get(id);
    if (!paquete) {
      paquete = await this.armarPaquete(q, id);
      this.cache.set(id, paquete);
    }
    const { parametros, usados, validez } = await this.cargarParametros(q, f);
    return { fecha: f, versionId: id, versionNombre: nombre, paquete, parametros, parametrosUsados: usados, validezDiasHabiles: validez };
  }

  // ---------------------------------------------------------------- tarifas
  async armarPaquete(q: Consulta, versionId: string): Promise<PaqueteTarifas> {
    const igr = {} as PaqueteTarifas['igr'];
    for (const r of REGIONALES) {
      igr[r] = {} as PaqueteTarifas['igr'][Regional];
      for (const p of ['IG', 'RM', 'AD'] as const) igr[r][p] = { M: vacio(), F: vacio(), 'F-M': vacio() };
    }
    const mbAdulto: PaqueteTarifas['mbAdulto'] = {};
    const mbHijo: PaqueteTarifas['mbHijo'] = {};
    const np: PaqueteTarifas['np'] = {};

    const filas = await q.query<{
      plan: string; producto: string; region: string | null; sexo: SexoTarifa | null;
      edad_desde: number; edad_hasta: number; prima: string | null;
    }>(
      `SELECT p.codigo AS plan, pr.codigo AS producto, r.codigo AS region, t.sexo,
              t.edad_desde, t.edad_hasta, t.prima
         FROM tarifa t
         JOIN plan p ON p.id = t.plan_id
         JOIN producto pr ON pr.id = p.producto_id
         LEFT JOIN region r ON r.id = t.region_id
        WHERE t.version_id = $1`,
      [versionId],
    );
    for (const f of filas.rows) {
      const prima = f.prima === null ? null : Number(f.prima);
      let destino: Array<number | null> | undefined;
      if (f.producto === 'IG' || f.producto === 'AD' || (f.producto === 'RM' && f.plan === 'RM_700K')) {
        destino = igr[f.region as Regional]?.[f.producto]?.[f.sexo as SexoTarifa];
      } else if (f.producto === 'MB') {
        const k = f.plan.replace(/^MB_/, '');
        destino = mbAdulto[k] ??= vacio();
      } else if (f.producto === 'NP') {
        const k = f.plan.replace(/^NP_/, '');
        destino = np[k] ??= vacio();
      }
      if (!destino) continue;
      for (let e = f.edad_desde; e <= Math.min(f.edad_hasta, EDADES - 1); e++) destino[e] = prima;
    }

    const hijos = await q.query<{ plan: string; numero_hijos: number; prima: string }>(
      `SELECT p.codigo AS plan, h.numero_hijos, h.prima_por_hijo AS prima
         FROM tarifa_hijo h JOIN plan p ON p.id = h.plan_id WHERE h.version_id = $1`,
      [versionId],
    );
    for (const h of hijos.rows) {
      const arr = (mbHijo[h.plan.replace(/^MB_/, '')] ??= [null, null, null, null, null, null]);
      arr[h.numero_hijos] = Number(h.prima);
    }

    return { igr, mbAdulto, mbHijo, np, catalogoNP: await this.catalogoNP(q) };
  }

  /** Combinaciones de Naranja+ ofrecidas: salen de los planes activos, no del código. */
  private async catalogoNP(q: Consulta): Promise<PaqueteTarifas['catalogoNP']> {
    const r = await q.query<{ codigo: string; ambito: AmbitoNP; va: string; ded: string }>(
      `SELECT p.codigo, p.ambito, p.valor_asegurado AS va, p.deducible AS ded
         FROM plan p JOIN producto pr ON pr.id = p.producto_id
        WHERE pr.codigo = 'NP' AND p.activo ORDER BY p.valor_asegurado, p.deducible`,
    );
    const cat = {} as PaqueteTarifas['catalogoNP'];
    for (const f of r.rows) {
      const m = /^NP_(L|MB)_([^_]+)_([^_]+)$/.exec(f.codigo);
      if (!m) continue;
      const c = (cat[f.ambito] ??= { codigo: m[1] as 'L' | 'MB', valoresAsegurados: [], deducibles: [] });
      if (!c.valoresAsegurados.includes(m[2]!)) c.valoresAsegurados.push(m[2]!);
      if (!c.deducibles.includes(m[3]!)) c.deducibles.push(m[3]!);
    }
    return cat;
  }

  // ---------------------------------------------------------------- parámetros
  async cargarParametros(q: Consulta, fecha: string) {
    const r = await q.query<{ clave: string; producto: string | null; plan: string | null; valor: string }>(
      `SELECT pa.clave, pr.codigo AS producto, pl.codigo AS plan, pa.valor
         FROM parametro pa
         LEFT JOIN producto pr ON pr.id = pa.producto_id
         LEFT JOIN plan pl ON pl.id = pa.plan_id
        WHERE pa.vigente_desde <= $1::date AND (pa.vigente_hasta IS NULL OR pa.vigente_hasta > $1::date)`,
      [fecha],
    );
    const usados: Record<string, number> = {};
    for (const f of r.rows) usados[[f.clave, f.producto ?? f.plan ?? ''].filter(Boolean).join(':')] = Number(f.valor);

    const get = (clave: string, ambito?: string): number => {
      const k = ambito ? `${clave}:${ambito}` : clave;
      const v = usados[k];
      if (v === undefined) throw new ParametroFaltanteError(`Parámetro vigente no configurado: ${k} (al ${fecha})`);
      return v;
    };
    const igual = (clave: string, a: string[]): number => {
      const vals = a.map((x) => get(clave, x));
      if (new Set(vals).size > 1) {
        throw new ParametroFaltanteError(`${clave} difiere entre productos (${a.join('/')}); el motor admite un único valor`);
      }
      return vals[0]!;
    };

    const planes: PlanRedMax[] = ['RM_700K', 'RM_140K', 'RM_70K'];
    const parametros: Parametros = {
      ...PARAMETROS_INICIALES,
      rmDescuento: Object.fromEntries(planes.map((p) => [p, get('RM_DESCUENTO', p)])) as Record<PlanRedMax, number>,
      sars: { IG: get('SARS_RECARGO', 'IG'), RM: get('SARS_RECARGO', 'RM') },
      maternidadRecargo: { IG: get('MATERNIDAD_RECARGO', 'IG'), RM: get('MATERNIDAD_RECARGO', 'RM') },
      maternidadEdad: {
        min: igual('MATERNIDAD_EDAD_MIN', ['IG', 'RM', 'AD']),
        max: igual('MATERNIDAD_EDAD_MAX', ['IG', 'RM', 'AD']),
      },
      contadoFactor: {
        IG: get('CONTADO_FACTOR', 'IG'), RM: get('CONTADO_FACTOR', 'RM'),
        AD: get('CONTADO_FACTOR', 'AD'), MB: get('CONTADO_FACTOR', 'MB'),
      },
      contadoDivisorNP: get('CONTADO_DIVISOR', 'NP'),
      mbEdadAdulto: { titularConyuge: get('MB_EDAD_ADULTO_TITULAR_CONYUGE', 'MB'), dependiente: get('MB_EDAD_ADULTO_DEPENDIENTE', 'MB') },
      np: {
        divisor: get('NP_DIVISOR', 'NP'), factor1: get('NP_FACTOR_1', 'NP'), factor2: get('NP_FACTOR_2', 'NP'),
        edadMax: get('NP_EDAD_MAX', 'NP'), exclusionMaternidadEdadMax: get('NP_EXCLUSION_MATERNIDAD_EDAD_MAX', 'NP'),
      },
      combinadaIncluyeSars: get('COMBINADA_INCLUYE_SARS') !== 0,
      edadMaxima: get('EDAD_MAXIMA_ASEGURADO'),
    };
    return { parametros, usados: { ...usados, ...{ advanceMaternidadUsaTabla: parametros.advanceMaternidadUsaTabla } }, validez: get('COTIZACION_VALIDEZ_DIAS_HABILES') };
  }
}
