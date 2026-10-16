import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EntradaCotizacion, Producto } from '../src/index.js';
import { calcular } from './ayudas.js';

interface Caso { nombre: string; entrada: EntradaCotizacion; personas: Array<{ idx: number; excel: Record<string, number | string | null> }> }
const casos: Caso[] = JSON.parse(readFileSync(new URL('../fixtures/conciliacion_excel.json', import.meta.url), 'utf8'));
const PRODUCTOS: Producto[] = ['IG', 'RM', 'AD', 'MB', 'NP'];

type Categoria = 'MATERNIDAD_IG_RM' | 'REDONDEO_HIJO_MB' | 'ADVANCE_MATERNIDAD_FUERA_DE_RANGO' | 'ERROR_EXCEL_INFINITY_SARS';
interface Diferencia { escenario: string; asegurado: number; producto: Producto; categoria: Categoria; excel: unknown; sistema: unknown }

describe('conciliación masiva contra el Excel (53 escenarios)', () => {
  it('toda diferencia es una de las cuatro diferencias intencionales', () => {
    const difs: Diferencia[] = [];
    let comparaciones = 0;
    for (const c of casos) {
      const r = calcular(c.entrada);
      for (const p of c.personas) {
        const a = c.entrada.asegurados[p.idx]!;
        for (const prod of PRODUCTOS) {
          comparaciones++;
          const l = r.lineas.find((x) => x.aseguradoIdx === p.idx && x.producto === prod)!;
          const ex = p.excel[prod]!;
          const sistema = l.estado === 'OK' ? l.primaMensual!.toNumber() : 'N/A';
          const igual = ex === 'N/A' ? sistema === 'N/A' : sistema === ex;
          if (igual) continue;
          const mat = a.sexo === 'FEMENINO_CON_MATERNIDAD';
          let categoria: Categoria | undefined;
          // Defecto del Excel: Infinity con SARS = SI devuelve #VALUE! para quien no tiene tarifa; el sistema responde "No disponible".
          if (prod === 'IG' && c.entrada.aplicaSars && typeof ex === 'string' && ex.startsWith('#') && sistema === 'N/A') categoria = 'ERROR_EXCEL_INFINITY_SARS';
          else if (mat && (prod === 'IG' || prod === 'RM')) categoria = 'MATERNIDAD_IG_RM';
          else if (prod === 'MB' && typeof ex === 'number' && !Number.isInteger(ex)) categoria = 'REDONDEO_HIJO_MB';
          else if (mat && prod === 'AD' && sistema === 'N/A' && ex === 0) categoria = 'ADVANCE_MATERNIDAD_FUERA_DE_RANGO';
          expect(categoria, `Diferencia NO esperada: ${c.nombre} asegurado ${p.idx} ${prod}: Excel=${String(ex)} sistema=${String(sistema)}`).toBeDefined();
          difs.push({ escenario: c.nombre, asegurado: p.idx, producto: prod, categoria: categoria!, excel: ex, sistema });
        }
      }
    }
    const porCategoria = difs.reduce<Record<string, number>>((m, d) => ((m[d.categoria] = (m[d.categoria] ?? 0) + 1), m), {});
    mkdirSync(new URL('../informes/', import.meta.url), { recursive: true });
    writeFileSync(new URL('../informes/conciliacion.json', import.meta.url),
      JSON.stringify({ escenarios: casos.length, comparaciones, iguales: comparaciones - difs.length, diferenciasIntencionales: porCategoria, detalle: difs }, null, 1));
    console.log(`Escenarios: ${casos.length} · comparaciones: ${comparaciones} · iguales: ${comparaciones - difs.length} · intencionales: ${JSON.stringify(porCategoria)}`);
    expect(comparaciones).toBe(casos.length * 7 * 5);
  });

  it('cada una de las 18 combinaciones de Mundial Blue y las 22 de Naranja+ está cubierta', () => {
    const mb = new Set(casos.map((c) => `${c.entrada.mundialBlue!.cobertura}_${c.entrada.mundialBlue!.deducible}`));
    const np = new Set(casos.map((c) => `${c.entrada.naranjaPlus!.ambito}_${c.entrada.naranjaPlus!.valorAsegurado}_${c.entrada.naranjaPlus!.deducible}`));
    expect(mb.size).toBe(18);
    expect(np.size).toBe(22);
  });
});
