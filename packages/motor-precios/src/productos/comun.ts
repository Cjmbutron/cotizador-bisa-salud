import type Decimal from 'decimal.js';
import type { Asegurado, EntradaCotizacion, Estado, Linea, PaqueteTarifas, Parametros, PasoCalculo, Producto } from '../tipos.js';

export interface Contexto {
  entrada: EntradaCotizacion;
  tarifas: PaqueteTarifas;
  parametros: Parametros;
}

export type CalculadorLinea = (a: Asegurado, idx: number, ctx: Contexto) => Linea;

export function lineaSinPrima(
  idx: number, producto: Producto, estado: Exclude<Estado, 'OK'>, motivo: string, detalle: PasoCalculo[] = [],
): Linea {
  return { aseguradoIdx: idx, producto, estado, motivo, detalle };
}

export function lineaOk(
  idx: number, producto: Producto, detalle: PasoCalculo[],
  v: { primaBase?: Decimal; recargoMaternidad?: Decimal; recargoSars?: Decimal; primaMensual: Decimal; primaMensualSinSars: Decimal },
): Linea {
  return { aseguradoIdx: idx, producto, estado: 'OK', detalle, ...v };
}

export const paso = (p: string, valor?: Decimal.Value | string): PasoCalculo =>
  valor === undefined ? { paso: p } : { paso: p, valor: String(valor) };
