import type { EntradaCotizacion } from '@bisa/motor-precios';
import type { Valor } from './formula';

/** Datos de una cotización guardada, tal como los devuelve CotizacionesService.obtener. */
export interface DatosPropuesta {
  numero: string;
  titularNombre: string;
  entrada: EntradaCotizacion;
  asegurados: { orden: number; parentesco: 'TITULAR' | 'CONYUGE' | 'DEPENDIENTE'; edad: number; sexo: string }[];
  lineas: { aseguradoOrden: number; producto: string; estado: string; primaMensual: string | null }[];
  totales: { producto: string; mensual: string; anual: string; contado: string }[];
}

const REGIONAL: Record<string, string> = {
  LPZ: 'LA PAZ', CBBA: 'COCHABAMBA', SCZ: 'SANTA CRUZ', CHQ: 'CHUQUISACA', TJA: 'TARIJA',
};
const COLUMNA_PRODUCTO: Record<string, string> = { MB: 'M', IG: 'P', RM: 'S', AD: 'T', NP: 'U' };
const PLAN_RM: Record<string, string> = { RM_700K: 'Bs. 700.000.-', RM_140K: 'Bs. 140.000.-', RM_70K: 'Bs. 70.000.-' };
const ETIQUETA_SEXO: Record<string, string> = {
  MASCULINO: 'MASCULINO', FEMENINO_SIN_MATERNIDAD: 'FEMENINO SIN MATERNIDAD', FEMENINO_CON_MATERNIDAD: 'FEMENINO CON MATERNIDAD',
};

/** "5K" -> "USD 5.000.-" ; "1MM" -> "USD 1.000.000.-" (formato del cotizador de Excel). */
export function textoUsd(codigo: string): string {
  const m = /^(\d+)(K|MM)$/.exec(codigo);
  if (!m) return codigo;
  const n = Number(m[1]) * (m[2] === 'K' ? 1_000 : 1_000_000);
  return `USD ${n.toLocaleString('de-DE')}.-`;
}

/** Fila del cotizador de Excel donde va cada asegurado: 17 titular, 18 cónyuge, 19..23 dependientes. */
export function filasDeAsegurados(d: DatosPropuesta): Map<number, number> {
  const filas = new Map<number, number>();
  let dep = 0;
  for (const a of [...d.asegurados].sort((x, y) => x.orden - y.orden)) {
    const fila = a.parentesco === 'TITULAR' ? 17 : a.parentesco === 'CONYUGE' ? 18 : 18 + ++dep;
    filas.set(a.orden, fila);
  }
  return filas;
}

/**
 * Reconstruye, para un producto, las celdas de la hoja COTIZADOR del Excel que leen las plantillas.
 * Devuelve una función coordenada -> valor (celda vacía = null).
 */
export function cotizadorVirtual(d: DatosPropuesta, producto: string): (coord: string) => Valor {
  const celdas = new Map<string, Valor>();
  const e = d.entrada;
  celdas.set('C9', REGIONAL[e.regional] ?? e.regional);
  celdas.set('C11', e.aplicaSars ? 'SI' : 'NO');
  celdas.set('C17', d.titularNombre);
  if (e.redMax) celdas.set('U13', PLAN_RM[e.redMax.plan] ?? '');
  if (e.mundialBlue) {
    celdas.set('M7', textoUsd(e.mundialBlue.cobertura));
    celdas.set('M9', textoUsd(e.mundialBlue.deducible));
    if (e.mundialBlue.numeroHijos != null) celdas.set('M11', e.mundialBlue.numeroHijos);
  }
  if (e.naranjaPlus) {
    celdas.set('U7', e.naranjaPlus.ambito === 'BOLIVIA' ? 'BOLIVIA' : 'MUNDIAL INCLUYENDO BOLIVIA');
    celdas.set('U9', textoUsd(e.naranjaPlus.valorAsegurado));
    celdas.set('U11', textoUsd(e.naranjaPlus.deducible));
  }
  const filas = filasDeAsegurados(d);
  const col = COLUMNA_PRODUCTO[producto]!;
  for (const a of d.asegurados) {
    const f = filas.get(a.orden)!;
    celdas.set(`E${f}`, a.parentesco);
    celdas.set(`F${f}`, a.edad);
    celdas.set(`G${f}`, ETIQUETA_SEXO[a.sexo] ?? a.sexo);
    const l = d.lineas.find((x) => x.producto === producto && x.aseguradoOrden === a.orden);
    if (l) celdas.set(`${col}${f}`, l.estado === 'OK' && l.primaMensual != null ? Number(l.primaMensual) : 'N/A');
  }
  const t = d.totales.find((x) => x.producto === producto);
  if (t) {
    celdas.set(`${col}24`, Number(t.mensual));
    celdas.set(`${col}25`, Number(t.anual));
    celdas.set(`${col}26`, Number(t.contado));
  }
  return (coord) => celdas.get(coord) ?? null;
}

/** ¿Alguna asegurada eligió maternidad? Decide entre la plantilla CM y la SM. */
export function conMaternidad(d: DatosPropuesta): boolean {
  return d.asegurados.some((a) => a.sexo === 'FEMENINO_CON_MATERNIDAD');
}

export function claveDePlantilla(d: DatosPropuesta, producto: string): string {
  const cm = conMaternidad(d) ? 'CM' : 'SM';
  switch (producto) {
    case 'IG': case 'RM': case 'AD': return `${producto}_${cm}`;
    case 'MB': return `MB_${d.entrada.mundialBlue?.cobertura ?? ''}_${cm}`;
    case 'NP': return 'NP';
    default: throw new Error(`Producto desconocido: ${producto}`);
  }
}
