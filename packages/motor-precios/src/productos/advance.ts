import { dec } from '../redondeo.js';
import { conMaternidad, sexoTarifa } from '../util.js';
import { lineaOk, lineaSinPrima, paso, type CalculadorLinea } from './comun.js';

/** Advance: tarifa plana, sin SARS ni extra prima. Con maternidad usa la columna F-M (en el Excel F-M y F son iguales). */
export const calcularAD: CalculadorLinea = (a, idx, { entrada, tarifas, parametros: p }) => {
  const mat = conMaternidad(a);
  const fuera = mat && (a.edad < p.maternidadEdad.min || a.edad > p.maternidadEdad.max);
  if (fuera && !p.advanceMaternidadUsaTabla) {
    return lineaSinPrima(idx, 'AD', 'NO_DISPONIBLE', `Maternidad solo de ${p.maternidadEdad.min} a ${p.maternidadEdad.max} años`);
  }
  const col = sexoTarifa(a);
  const v = tarifas.igr[entrada.regional]?.AD?.[col]?.[a.edad] ?? null;
  const detalle = [paso(`Tarifa Advance ${entrada.regional} ${col} edad ${a.edad}`, v ?? 'N/A')];
  if (v === null) return lineaSinPrima(idx, 'AD', 'NO_DISPONIBLE', 'Sin tarifa para esa edad', detalle);
  const prima = dec(v);
  return lineaOk(idx, 'AD', detalle, { primaBase: prima, primaMensual: prima, primaMensualSinSars: prima });
};
