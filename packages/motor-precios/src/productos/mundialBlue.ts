import { dec, techo } from '../redondeo.js';
import { esAdultoMB } from '../util.js';
import { lineaOk, lineaSinPrima, paso, type CalculadorLinea } from './comun.js';

/** Mundial Blue: no distingue sexo, maternidad ni regional. Umbral de adulto: 18 titular/cónyuge, 25 dependiente. */
export const calcularMB: CalculadorLinea = (a, idx, { entrada, tarifas, parametros: p }) => {
  const mb = entrada.mundialBlue!;
  const clave = `${mb.cobertura}_${mb.deducible}`;
  if (esAdultoMB(a, p)) {
    const v = tarifas.mbAdulto[clave]?.[a.edad] ?? null;
    const detalle = [paso(`Tarifa adulto ${clave} edad ${a.edad}`, v ?? 'N/A')];
    if (v === null) return lineaSinPrima(idx, 'MB', 'NO_DISPONIBLE', 'Desde 75 años solo renovaciones', detalle);
    const prima = dec(v);
    return lineaOk(idx, 'MB', detalle, { primaBase: prima, primaMensual: prima, primaMensualSinSars: prima });
  }
  const n = mb.numeroHijos!;
  const v = tarifas.mbHijo[clave]?.[n] ?? null;
  const detalle = [paso(`Tarifa por hijo ${clave} con ${n} hijo(s)`, v ?? 'N/A')];
  if (v === null) return lineaSinPrima(idx, 'MB', 'NO_DISPONIBLE', 'Sin tarifa por hijo', detalle);
  const prima = techo(v);
  detalle.push(paso('Redondeo al entero superior', prima));
  return lineaOk(idx, 'MB', detalle, { primaBase: prima, primaMensual: prima, primaMensualSinSars: prima });
};
