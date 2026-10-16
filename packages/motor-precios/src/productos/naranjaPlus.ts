import { dec, redondear, techo } from '../redondeo.js';
import { conMaternidad } from '../util.js';
import { lineaOk, lineaSinPrima, paso, type CalculadorLinea } from './comun.js';

/** Naranja+: tarifa ANUAL transformada con la fórmula del Excel (RN-017). Sin SARS ni extra prima. */
export const calcularNP: CalculadorLinea = (a, idx, { entrada, tarifas, parametros: p }) => {
  if (a.edad > p.np.edadMax) return lineaSinPrima(idx, 'NP', 'EXCLUIDO', `Mayor de ${p.np.edadMax} años`);
  if (a.edad >= 1 && a.edad <= p.np.exclusionMaternidadEdadMax && conMaternidad(a))
    return lineaSinPrima(idx, 'NP', 'EXCLUIDO', `Mujer de 1 a ${p.np.exclusionMaternidadEdadMax} años con maternidad`);
  if (a.edad === 0) {
    const cero = dec(0);
    return lineaOk(idx, 'NP', [paso('Edad 0: prima 0')], { primaBase: cero, primaMensual: cero, primaMensualSinSars: cero });
  }
  const np = entrada.naranjaPlus!;
  const cod = tarifas.catalogoNP[np.ambito].codigo;
  const clave = `${cod}_${np.valorAsegurado}_${np.deducible}`;
  const anual = tarifas.np[clave]?.[a.edad] ?? null;
  const detalle = [paso(`Tarifa anual ${clave} edad ${a.edad}`, anual ?? 'N/A')];
  if (anual === null) return lineaSinPrima(idx, 'NP', 'NO_DISPONIBLE', 'Sin tarifa para esa edad', detalle);
  const mensual = techo(dec(anual).div(12));
  const paso2 = redondear(mensual.div(p.np.divisor).times(p.np.factor1));
  const prima = redondear(paso2.times(p.np.factor2));
  detalle.push(paso('techo(anual / 12)', mensual), paso(`redondear(/ ${p.np.divisor} x ${p.np.factor1})`, paso2),
    paso(`redondear(x ${p.np.factor2})`, prima));
  return lineaOk(idx, 'NP', detalle, { primaBase: prima, primaMensual: prima, primaMensualSinSars: prima });
};
