import type Decimal from 'decimal.js';
import { dec, techo } from './redondeo.js';
import type { Combinada, EntradaCotizacion, Linea, Parametros, Producto, TotalProducto } from './tipos.js';

/** Contado sin redondear: anual x factor (Naranja+: anual / divisor). */
export function contadoExacto(producto: Producto, anual: Decimal, p: Parametros): Decimal {
  if (producto === 'NP') return anual.div(p.contadoDivisorNP);
  return anual.times(p.contadoFactor[producto]);
}

/** Contado de un producto: entero inmediato superior (decisión R6). */
export function contadoDe(producto: Producto, anual: Decimal, p: Parametros): Decimal {
  return techo(contadoExacto(producto, anual, p));
}

const mensualDe = (lineas: Linea[], producto: Producto, sinSars = false): Decimal =>
  lineas
    .filter((l) => l.producto === producto && l.estado === 'OK')
    .reduce((s, l) => s.plus((sinSars ? l.primaMensualSinSars : l.primaMensual) ?? 0), dec(0));

const total = (producto: Producto, mensual: Decimal, p: Parametros): TotalProducto => {
  const anual = mensual.times(12);
  return { producto, mensual, anual, contado: contadoDe(producto, anual, p) };
};

export function calcularTotales(lineas: Linea[], e: EntradaCotizacion, p: Parametros): TotalProducto[] {
  return e.productos.map((prod) => total(prod, mensualDe(lineas, prod), p));
}

/**
 * Suma combinada: la prima de cada asegurado viene del producto que eligió.
 * Decisión P3: el contado combinado suma los contados SIN redondear de cada producto y redondea hacia arriba UNA sola vez.
 * Cada producto de `porProducto` conserva su propio contado redondeado.
 */
export function calcularCombinada(lineas: Linea[], e: EntradaCotizacion, p: Parametros): Combinada | undefined {
  if (!e.asegurados.some((a) => a.productoElegido)) return undefined;
  const mensualPorProducto = new Map<Producto, Decimal>();
  e.asegurados.forEach((a, i) => {
    if (!a.productoElegido) return;
    const l = lineas.find((x) => x.aseguradoIdx === i && x.producto === a.productoElegido);
    if (!l || l.estado !== 'OK') return;
    const prima = (p.combinadaIncluyeSars ? l.primaMensual : l.primaMensualSinSars) ?? dec(0);
    mensualPorProducto.set(a.productoElegido, (mensualPorProducto.get(a.productoElegido) ?? dec(0)).plus(prima));
  });
  const porProducto = [...mensualPorProducto.entries()].map(([prod, m]) => total(prod, m, p));
  const suma = (f: (t: TotalProducto) => Decimal) => porProducto.reduce((s, t) => s.plus(f(t)), dec(0));
  const contadoExactoTotal = porProducto.reduce((acc, t) => acc.plus(contadoExacto(t.producto, t.anual, p)), dec(0));
  return { mensual: suma((t) => t.mensual), anual: suma((t) => t.anual), contado: techo(contadoExactoTotal), porProducto };
}
