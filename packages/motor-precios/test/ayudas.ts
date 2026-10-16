import { readFileSync } from 'node:fs';
import type { Asegurado, EntradaCotizacion, PaqueteTarifas, ResultadoCotizacion } from '../src/index.js';
import { cotizar } from '../src/index.js';

export const tarifas: PaqueteTarifas = JSON.parse(
  readFileSync(new URL('../fixtures/tarifas.json', import.meta.url), 'utf8'),
);

export const base = (extra: Partial<EntradaCotizacion> = {}): EntradaCotizacion => ({
  regional: 'LPZ', aplicaSars: false, productos: ['IG', 'RM', 'AD', 'MB', 'NP'],
  asegurados: [{ parentesco: 'TITULAR', edad: 30, sexo: 'MASCULINO' }],
  redMax: { plan: 'RM_700K' },
  mundialBlue: { cobertura: '1MM', deducible: '5K', numeroHijos: 1 },
  naranjaPlus: { ambito: 'MUNDIAL_CON_BOLIVIA', valorAsegurado: '1MM', deducible: '10K' },
  ...extra,
});

export const una = (a: Partial<Asegurado>, extra: Partial<EntradaCotizacion> = {}) =>
  base({ asegurados: [{ parentesco: 'TITULAR', edad: 30, sexo: 'MASCULINO', ...a }], ...extra });

export function calcular(e: EntradaCotizacion): ResultadoCotizacion {
  const r = cotizar(e, tarifas);
  if (!r.ok) throw new Error('Entrada rechazada: ' + JSON.stringify(r.errores));
  return r.resultado;
}

export const linea = (r: ResultadoCotizacion, producto: string, idx = 0) => {
  const l = r.lineas.find((x) => x.producto === producto && x.aseguradoIdx === idx);
  if (!l) throw new Error(`Sin línea ${producto}/${idx}`);
  return l;
};
export const prima = (r: ResultadoCotizacion, producto: string, idx = 0) => linea(r, producto, idx).primaMensual?.toNumber();
