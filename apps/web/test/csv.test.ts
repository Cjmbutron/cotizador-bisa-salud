import assert from 'node:assert/strict';
import { test } from 'node:test';
import { leerTarifasCsv } from '../src/lib/csv.ts';

test('lee filas con y sin región/sexo y N/A', () => {
  const r = leerTarifasCsv('plan,region,sexo,edad,prima\nIG,LPZ,M,30,66.5\nMB_1MM_5K,,,40,312\nIG,LPZ,F,99,N/A\nIG,LPZ,F,98,');
  assert.deepEqual(r.errores, []);
  assert.deepEqual(r.filas, [
    { plan: 'IG', region: 'LPZ', sexo: 'M', edad: 30, prima: 66.5 },
    { plan: 'MB_1MM_5K', edad: 40, prima: 312 },
    { plan: 'IG', region: 'LPZ', sexo: 'F', edad: 99, prima: null },
    { plan: 'IG', region: 'LPZ', sexo: 'F', edad: 98, prima: null },
  ]);
});
test('acepta tabulaciones (pegado desde Excel)', () => {
  assert.equal(leerTarifasCsv('plan\tregion\tsexo\tedad\tprima\nIG\tLPZ\tM\t30\t66').filas.length, 1);
});
test('encabezado incorrecto', () => assert.match(leerTarifasCsv('a,b\n1,2').errores[0]!, /encabezado/));
test('rechaza coma decimal, edades y columnas mal formadas, con el número de línea', () => {
  const r = leerTarifasCsv('plan,region,sexo,edad,prima\nIG,LPZ,M,30,66,5\nIG,LPZ,M,x,66\nIG,LPZ,M,30,1.234,5');
  assert.equal(r.filas.length, 0);
  assert.match(r.errores[0]!, /Línea 2: se esperan 5 columnas/);
  assert.match(r.errores[1]!, /Línea 3: edad inválida/);
  assert.match(r.errores[2]!, /Línea 4/);
});
test('vacío', () => assert.match(leerTarifasCsv('  \n').errores[0]!, /No hay datos/));
