import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EntradaCotizacion, Producto } from '../src/index.js';
import { calcular } from './ayudas.js';

interface Caso {
  nombre: string;
  entrada: EntradaCotizacion;
  personas: Array<{ idx: number; excel: Record<string, number | string>; esperado: Record<string, number | string> }>;
  totales: Record<string, { mensual: number; anual: number; contado: number }>;
}
const casos: Caso[] = JSON.parse(readFileSync(new URL('../fixtures/golden.json', import.meta.url), 'utf8'));

describe('caracterización contra el Excel', () => {
  for (const c of casos) {
    it(`${c.nombre}: coincide con lo esperado del sistema`, () => {
      const r = calcular(c.entrada);
      for (const p of c.personas) {
        for (const prod of c.entrada.productos) {
          const l = r.lineas.find((x) => x.aseguradoIdx === p.idx && x.producto === prod)!;
          const esp = p.esperado[prod]!;
          if (esp === 'N/A') expect(l.estado, `${c.nombre} #${p.idx} ${prod}`).not.toBe('OK');
          else expect(l.primaMensual?.toNumber(), `${c.nombre} #${p.idx} ${prod}`).toBe(esp);
        }
      }
      for (const prod of c.entrada.productos) {
        const t = r.totales.find((x) => x.producto === prod)!;
        const e = c.totales[prod]!;
        expect([t.mensual.toNumber(), t.anual.toNumber(), t.contado.toNumber()], `${c.nombre} total ${prod}`)
          .toEqual([e.mensual, e.anual, e.contado]);
      }
    });
  }

  it('toda diferencia contra el Excel es una de las dos diferencias intencionales', () => {
    const difs: string[] = [];
    let comparaciones = 0;
    for (const c of casos) {
      const r = calcular(c.entrada);
      for (const p of c.personas) {
        const a = c.entrada.asegurados[p.idx]!;
        for (const prod of c.entrada.productos as Producto[]) {
          comparaciones++;
          const l = r.lineas.find((x) => x.aseguradoIdx === p.idx && x.producto === prod)!;
          const ex = p.excel[prod]!;
          const igual = ex === 'N/A' ? l.estado !== 'OK' : l.primaMensual?.toNumber() === ex;
          if (igual) continue;
          const maternidad = a.sexo === 'FEMENINO_CON_MATERNIDAD' && (prod === 'IG' || prod === 'RM');   // decisión 17.5
          const redondeoHijo = prod === 'MB' && typeof ex === 'number' && !Number.isInteger(ex);          // decisión R6
          expect(maternidad || redondeoHijo, `Diferencia NO esperada: ${c.nombre} #${p.idx} ${prod}: Excel=${ex} sistema=${l.primaMensual?.toNumber()}`).toBe(true);
          difs.push(`${c.nombre}#${p.idx}/${prod}`);
        }
      }
    }
    // Se comparan los 18 escenarios recalculados con el Excel; los 4 con errores de datos los rechaza el sistema (V02, V05).
    expect(comparaciones).toBeGreaterThan(500);
    expect(difs.length).toBe(25);   // 25 diferencias intencionales: maternidad IG/RM (decisión 17.5) y redondeo de hijo MB (R6)
    console.log(`Comparaciones: ${comparaciones} · diferencias intencionales: ${difs.length}`);
  });
});
