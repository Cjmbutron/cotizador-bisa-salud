import { readdirSync } from 'node:fs';
import { DIR_PLANTILLAS, cargarPlantilla } from '../src/documentos/plantilla';
import { cotizadorVirtual } from '../src/documentos/contexto';
import type { DatosPropuesta } from '../src/documentos/contexto';
import { entornoDe, mostrar } from '../src/documentos/render';

/** Cotización idéntica al estado en que quedó guardado el Excel (La Paz, sin SARS, titular de 11 años). */
const EXCEL: DatosPropuesta = {
  numero: 'COT-X', titularNombre: 'Jorge Vargas',
  entrada: {
    regional: 'LPZ', aplicaSars: false, productos: ['IG', 'RM', 'AD', 'MB', 'NP'], asegurados: [],
    redMax: { plan: 'RM_700K' },
    mundialBlue: { cobertura: '1MM', deducible: '5K', numeroHijos: 1 },
    naranjaPlus: { ambito: 'MUNDIAL_CON_BOLIVIA', valorAsegurado: '1MM', deducible: '10K' },
  },
  asegurados: [{ orden: 1, parentesco: 'TITULAR', edad: 11, sexo: 'FEMENINO_SIN_MATERNIDAD' }],
  lineas: [
    { aseguradoOrden: 1, producto: 'IG', estado: 'OK', primaMensual: '68' },
    { aseguradoOrden: 1, producto: 'RM', estado: 'OK', primaMensual: '427' },
    { aseguradoOrden: 1, producto: 'AD', estado: 'OK', primaMensual: '231' },
    { aseguradoOrden: 1, producto: 'MB', estado: 'OK', primaMensual: '44' },
    { aseguradoOrden: 1, producto: 'NP', estado: 'OK', primaMensual: '28' },
  ],
  totales: [
    { producto: 'IG', mensual: '68', anual: '816', contado: '795.6' },
    { producto: 'RM', mensual: '427', anual: '5124', contado: '4995.9' },
    { producto: 'AD', mensual: '231', anual: '2772', contado: '2702.7' },
    { producto: 'MB', mensual: '44', anual: '528', contado: '479.952' },
    { producto: 'NP', mensual: '28', anual: '336', contado: '305.45454545454544' },
  ],
};
const PRODUCTO_DE: Record<string, string> = { IG: 'IG', RM: 'RM', AD: 'AD', MB: 'MB', NP: 'NP' };
const claves = readdirSync(DIR_PLANTILLAS).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')).sort();

describe('plantillas de propuesta: el evaluador reproduce al Excel', () => {
  it('están las 13 plantillas', () => {
    expect(claves).toHaveLength(13);
  });

  it.each(claves)('%s: cada celda con fórmula da lo mismo que Excel guardó', (clave) => {
    const p = cargarPlantilla(clave);
    const producto = PRODUCTO_DE[clave.split('_')[0]!]!;
    const ev = entornoDe(p, cotizadorVirtual(EXCEL, producto), new Date());
    const diferencias: string[] = [];
    let conFormula = 0;
    for (const c of p.celdas) {
      if (!c.f) continue;
      if (c.f[0] === 'today') continue;
      conFormula++;
      const obtenido = mostrar(ev.valorDe(c), c.nf);
      const esperado = mostrar(c.v ?? null, c.nf);
      // Excel guarda " " o "" para "vacío": se comparan sin espacios
      if (obtenido.trim() !== esperado.trim()) diferencias.push(`${c.r + p.origen.fila},${c.c + p.origen.col}: obtuve «${obtenido}» y Excel «${esperado}»`);
    }
    expect(conFormula).toBeGreaterThan(5);
    expect(diferencias).toEqual([]);
  });
});
