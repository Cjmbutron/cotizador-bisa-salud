import { calcularAD } from './productos/advance.js';
import type { CalculadorLinea, Contexto } from './productos/comun.js';
import { calcularIG, calcularRM } from './productos/infinityRedMax.js';
import { calcularMB } from './productos/mundialBlue.js';
import { calcularNP } from './productos/naranjaPlus.js';
import { calcularCombinada, calcularTotales } from './totales.js';
import { PARAMETROS_INICIALES } from './tipos.js';
import type { EntradaCotizacion, Linea, PaqueteTarifas, Parametros, Producto, RespuestaCotizar } from './tipos.js';
import { validar } from './validar.js';

export * from './tipos.js';
export { redondear, techo, dec } from './redondeo.js';
export { validar } from './validar.js';

const CALCULADORES: Record<Producto, CalculadorLinea> = {
  IG: calcularIG, RM: calcularRM, AD: calcularAD, MB: calcularMB, NP: calcularNP,
};

/**
 * Función pura: mismos datos, mismo resultado. No lee base de datos ni la fecha del sistema.
 * Ante datos inválidos devuelve la lista de errores y no calcula.
 */
export function cotizar(
  entrada: EntradaCotizacion,
  tarifas: PaqueteTarifas,
  parametros: Parametros = PARAMETROS_INICIALES,
): RespuestaCotizar {
  const errores = validar(entrada, tarifas, parametros);
  if (errores.length > 0) return { ok: false, errores };

  const ctx: Contexto = { entrada, tarifas, parametros };
  const lineas: Linea[] = [];
  entrada.asegurados.forEach((a, i) => {
    for (const prod of entrada.productos) lineas.push(CALCULADORES[prod](a, i, ctx));
  });
  const totales = calcularTotales(lineas, entrada, parametros);
  const combinada = calcularCombinada(lineas, entrada, parametros);
  return { ok: true, resultado: combinada ? { lineas, totales, combinada } : { lineas, totales } };
}
