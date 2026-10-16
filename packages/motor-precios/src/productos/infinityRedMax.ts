import { dec } from '../redondeo.js';
import { conMaternidad, sexoTarifa } from '../util.js';
import { lineaOk, lineaSinPrima, paso, type CalculadorLinea } from './comun.js';
import type { PasoCalculo } from '../tipos.js';

/**
 * Infinity Green (IG) y Red Max (RM). Decisión 17.5: la mujer con maternidad paga la tarifa F más la extra prima
 * (no la columna F-M). El descuento de Red Max se aplica solo a la tarifa; luego se suma la extra prima y por último el SARS.
 */
const calcular = (producto: 'IG' | 'RM'): CalculadorLinea => (a, idx, { entrada, tarifas, parametros: p }) => {
  const detalle: PasoCalculo[] = [];
  const mat = conMaternidad(a);
  if (mat && (a.edad < p.maternidadEdad.min || a.edad > p.maternidadEdad.max)) {
    return lineaSinPrima(idx, producto, 'NO_DISPONIBLE',
      `Maternidad solo de ${p.maternidadEdad.min} a ${p.maternidadEdad.max} años`);
  }
  const columna = mat ? 'F' : sexoTarifa(a);
  detalle.push(paso('Columna de tarifa', columna + (mat ? ' (maternidad se cobra aparte)' : '')));
  const tabla = tarifas.igr[entrada.regional]?.[producto]?.[columna];
  const bruta = tabla?.[a.edad] ?? null;
  if (bruta === null) return lineaSinPrima(idx, producto, 'NO_DISPONIBLE', 'Sin tarifa para esa edad', detalle);
  detalle.push(paso(`Tarifa ${entrada.regional} edad ${a.edad}`, bruta));

  let base = dec(bruta);
  if (producto === 'RM') {
    const plan = entrada.redMax!.plan;
    const desc = p.rmDescuento[plan];
    base = base.minus(desc);
    detalle.push(paso(`Descuento plan ${plan}`, `-${desc}`));
    if (base.lt(1)) { base = dec(0); detalle.push(paso('Resultado menor que 1: prima 0')); }
  }
  const extra = mat ? dec(p.maternidadRecargo[producto]) : dec(0);
  if (mat) detalle.push(paso('Extra prima de maternidad', extra));
  const sinSars = base.plus(extra);
  const sars = entrada.aplicaSars && sinSars.gt(0) ? dec(p.sars[producto]) : dec(0);
  if (sars.gt(0)) detalle.push(paso('Recargo SARS COVID-19', sars));
  return lineaOk(idx, producto, detalle, {
    primaBase: base, recargoMaternidad: extra, recargoSars: sars,
    primaMensual: sinSars.plus(sars), primaMensualSinSars: sinSars,
  });
};

export const calcularIG = calcular('IG');
export const calcularRM = calcular('RM');
