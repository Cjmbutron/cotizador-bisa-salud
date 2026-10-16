import { describe, expect, it } from 'vitest';
import { PARAMETROS_INICIALES, cotizar } from '../src/index.js';
import { base, calcular, linea, prima, tarifas, una } from './ayudas.js';

const FSM = 'FEMENINO_SIN_MATERNIDAD' as const;
const FCM = 'FEMENINO_CON_MATERNIDAD' as const;

describe('Infinity Green y Red Max', () => {
  it('caso normal: hombre de 30 años, La Paz (valores del Excel)', () => {
    const r = calcular(una({}));
    expect(prima(r, 'IG')).toBe(66);
    expect(prima(r, 'RM')).toBe(412);
  });
  it('SARS: Infinity +10 USD, Red Max +70 Bs.; Advance y MB no cambian', () => {
    const r = calcular(una({}, { aplicaSars: true }));
    expect(prima(r, 'IG')).toBe(76);
    expect(prima(r, 'RM')).toBe(482);
    expect(prima(r, 'AD')).toBe(231);
    expect(prima(r, 'MB')).toBe(141);
  });
  it('descuento de Red Max: 0 / 28 / 49 sobre la tarifa de Bs. 700.000', () => {
    const p = (plan: 'RM_700K' | 'RM_140K' | 'RM_70K') => prima(calcular(una({}, { redMax: { plan } })), 'RM');
    expect(p('RM_700K')).toBe(412);
    expect(p('RM_140K')).toBe(384);
    expect(p('RM_70K')).toBe(363);
  });
  it('mujer con maternidad: tarifa F + extra prima (decisión 17.5)', () => {
    const r = calcular(una({ sexo: FCM, edad: 28 }));
    expect(prima(r, 'IG')).toBe(71 + 20);
    expect(prima(r, 'RM')).toBe(442 + 140);
    expect(linea(r, 'IG').recargoMaternidad?.toNumber()).toBe(20);
    expect(linea(r, 'RM').recargoMaternidad?.toNumber()).toBe(140);
  });
  it('la extra prima no recibe el descuento por valor asegurado (supuesto P2)', () => {
    const r = calcular(una({ sexo: FCM, edad: 28 }, { redMax: { plan: 'RM_140K' } }));
    expect(prima(r, 'RM')).toBe(442 - 28 + 140);
  });
  it('SARS se suma después de la extra prima', () => {
    const r = calcular(una({ sexo: FCM, edad: 28 }, { aplicaSars: true }));
    expect(prima(r, 'IG')).toBe(71 + 20 + 10);
    expect(linea(r, 'IG').primaMensualSinSars?.toNumber()).toBe(91);
  });
  it('maternidad solo de 19 a 49 años', () => {
    for (const edad of [18, 50]) {
      const r = calcular(una({ sexo: FCM, edad }));
      expect(linea(r, 'IG').estado).toBe('NO_DISPONIBLE');
      expect(linea(r, 'RM').estado).toBe('NO_DISPONIBLE');
    }
    for (const edad of [19, 49]) expect(linea(calcular(una({ sexo: FCM, edad })), 'IG').estado).toBe('OK');
  });
  it('límites de edad sin maternidad: 0 y 64 sí, 65 no', () => {
    expect(linea(calcular(una({ edad: 0 })), 'IG').estado).toBe('OK');
    expect(linea(calcular(una({ edad: 64 })), 'IG').estado).toBe('OK');
    expect(linea(calcular(una({ edad: 65 })), 'IG').estado).toBe('NO_DISPONIBLE');
    expect(linea(calcular(una({ edad: 65 })), 'RM').estado).toBe('NO_DISPONIBLE');
  });
  it('Chuquisaca y Tarija tienen la misma tarifa (se migra tal cual: pendiente R4)', () => {
    const a = calcular(una({}, { regional: 'CHQ' }));
    const b = calcular(una({}, { regional: 'TJA' }));
    expect(prima(a, 'IG')).toBe(prima(b, 'IG'));
    expect(prima(a, 'RM')).toBe(prima(b, 'RM'));
  });
});

describe('Advance', () => {
  it('tarifa plana, sin SARS ni extra prima', () => {
    const r = calcular(una({}, { aplicaSars: true }));
    expect(prima(r, 'AD')).toBe(231);
    expect(prima(calcular(una({ edad: 64 })), 'AD')).toBe(231);
    expect(prima(calcular(una({ edad: 0 })), 'AD')).toBe(231);
  });
  it('maternidad fuera de 19-49: "No disponible" por defecto (P1)', () => {
    expect(linea(calcular(una({ sexo: FCM, edad: 55 }, { regional: 'SCZ' })), 'AD').estado).toBe('NO_DISPONIBLE');
  });
  it('P1 con parámetro advanceMaternidadUsaTabla: Santa Cruz conserva el 0 de la tabla', () => {
    const e = una({ sexo: FCM, edad: 55 }, { regional: 'SCZ', productos: ['AD'] });
    const r = cotizar(e, tarifas, { ...PARAMETROS_INICIALES, advanceMaternidadUsaTabla: true });
    expect(r.ok && r.resultado.lineas[0]?.primaMensual?.toNumber()).toBe(0);
    const otra = cotizar({ ...e, regional: 'LPZ' }, tarifas, { ...PARAMETROS_INICIALES, advanceMaternidadUsaTabla: true });
    expect(r.ok && otra.ok && otra.resultado.lineas[0]?.estado).toBe('NO_DISPONIBLE');
  });
});

describe('Mundial Blue', () => {
  it('umbral de adulto: 18 titular/cónyuge, 25 dependiente', () => {
    const r = (parentesco: 'TITULAR' | 'CONYUGE' | 'DEPENDIENTE', edad: number) =>
      prima(calcular(una({ parentesco, edad }, { productos: ['MB'] })), 'MB');
    expect(r('TITULAR', 17)).toBe(44);     // hijo, 1 hijo, 1MM / 5K
    expect(r('TITULAR', 18)).toBe(109);    // adulto
    expect(r('CONYUGE', 18)).toBe(109);
    expect(r('DEPENDIENTE', 24)).toBe(44);
    expect(r('DEPENDIENTE', 25)).toBe(121);
  });
  it('no distingue sexo, maternidad ni regional', () => {
    const a = prima(calcular(una({ sexo: FCM, edad: 28 }, { productos: ['MB'], regional: 'SCZ' })), 'MB');
    const b = prima(calcular(una({ sexo: 'MASCULINO', edad: 28 }, { productos: ['MB'], regional: 'LPZ' })), 'MB');
    expect(a).toBe(b);
  });
  it('74 años tiene tarifa; desde 75 "No disponible"', () => {
    const e = (edad: number) => linea(calcular(una({ edad }, { productos: ['MB'] })), 'MB');
    expect(e(74).estado).toBe('OK');
    expect(e(75).estado).toBe('NO_DISPONIBLE');
    expect(e(99).estado).toBe('NO_DISPONIBLE');
  });
  it('tarifa por hijo según número de hijos, redondeada al entero superior', () => {
    const h = (n: number, cobertura: '1MM' | '2MM' | '5MM', deducible: '1K' | '5K' | '20K') =>
      prima(calcular(una({ edad: 5, parentesco: 'DEPENDIENTE' }, { productos: ['MB'], mundialBlue: { cobertura, deducible, numeroHijos: n } })), 'MB');
    expect(h(1, '1MM', '5K')).toBe(44);
    expect(h(3, '2MM', '1K')).toBe(130);
    expect(h(5, '5MM', '20K')).toBe(38);   // 37,8 en el Excel; R6 redondea al entero superior
  });
  it('combinaciones de cobertura y deducible', () => {
    const p = (cobertura: '1MM' | '2MM' | '5MM', deducible: '1K' | '5K' | '20K') =>
      prima(calcular(una({ edad: 40 }, { productos: ['MB'], mundialBlue: { cobertura, deducible } })), 'MB');
    expect(new Set([p('1MM', '1K'), p('1MM', '5K'), p('2MM', '1K'), p('5MM', '20K')]).size).toBe(4);
    expect(p('1MM', '1K') ?? 0).toBeGreaterThan(p('1MM', '5K') ?? 0);      // más deducible, menos prima
  });
});

describe('Naranja+', () => {
  it('fórmula del Excel (353 anual a los 30 → 28 mensual)', () => {
    expect(prima(calcular(una({ edad: 30 })), 'NP')).toBe(34);
    expect(prima(calcular(una({ edad: 11, sexo: FSM, parentesco: 'DEPENDIENTE' })), 'NP')).toBe(28);
  });
  it('edad 0: prima 0 (R10)', () => {
    const l = linea(calcular(una({ edad: 0 })), 'NP');
    expect(l.estado).toBe('OK');
    expect(l.primaMensual?.toNumber()).toBe(0);
  });
  it('exclusiones: mayores de 64 y mujeres de 1 a 18 con maternidad', () => {
    expect(linea(calcular(una({ edad: 65 })), 'NP').estado).toBe('EXCLUIDO');
    expect(linea(calcular(una({ edad: 64 })), 'NP').estado).toBe('OK');
    expect(linea(calcular(una({ edad: 18, sexo: FCM })), 'NP').estado).toBe('EXCLUIDO');
    expect(linea(calcular(una({ edad: 19, sexo: FCM })), 'NP').estado).toBe('OK');
  });
  it('Naranja+ no lleva SARS ni extra prima de maternidad', () => {
    const sin = prima(calcular(una({ edad: 30, sexo: FCM })), 'NP');
    const con = prima(calcular(una({ edad: 30, sexo: FCM }, { aplicaSars: true })), 'NP');
    expect(con).toBe(sin);
  });
  it('el ámbito cambia la tarifa', () => {
    const b = prima(calcular(una({}, { naranjaPlus: { ambito: 'BOLIVIA', valorAsegurado: '50K', deducible: '5K' } })), 'NP');
    const m = prima(calcular(una({})), 'NP');
    expect(b).not.toBe(m);
  });
});

describe('totales y contado', () => {
  const nomina = base({
    asegurados: [
      { parentesco: 'TITULAR', edad: 30, sexo: 'MASCULINO' },
      { parentesco: 'CONYUGE', edad: 28, sexo: FCM },
      { parentesco: 'DEPENDIENTE', edad: 5, sexo: 'MASCULINO' },
      { parentesco: 'DEPENDIENTE', edad: 20, sexo: FSM },
      { parentesco: 'DEPENDIENTE', edad: 24, sexo: 'MASCULINO' },
      { parentesco: 'DEPENDIENTE', edad: 25, sexo: FSM },
      { parentesco: 'DEPENDIENTE', edad: 0, sexo: 'MASCULINO' },
    ],
  });
  it('mensual, anual (x12) y contado con redondeo al entero superior', () => {
    const r = calcular(nomina);
    const t = (p: string) => r.totales.find((x) => x.producto === p)!;
    expect(t('IG').mensual.toNumber()).toBe(520);
    expect(t('IG').anual.toNumber()).toBe(6240);
    expect(t('IG').contado.toNumber()).toBe(6084);      // 6240 x 0,975
    expect(t('MB').mensual.toNumber()).toBe(559);
    expect(t('MB').contado.toNumber()).toBe(6098);      // 6708 x 0,909 = 6097,572 → 6098
    expect(t('NP').contado.toNumber()).toBe(1899);      // 2088 / 1,1 = 1898,18 → 1899
  });
  it('las líneas no disponibles no suman ni rompen el total', () => {
    const r = calcular(una({ edad: 70 }, { productos: ['IG', 'MB'] }));
    expect(linea(r, 'IG').estado).toBe('NO_DISPONIBLE');
    expect(r.totales.find((t) => t.producto === 'IG')!.mensual.toNumber()).toBe(0);
    expect(r.totales.find((t) => t.producto === 'MB')!.mensual.toNumber()).toBeGreaterThan(0);
  });
  it('es una función pura: mismas entradas, mismo resultado', () => {
    const a = JSON.stringify(calcular(nomina));
    expect(JSON.stringify(calcular(nomina))).toBe(a);
  });
  it('cada línea trae su detalle de cálculo', () => {
    for (const l of calcular(nomina).lineas) expect(l.detalle.length).toBeGreaterThan(0);
  });
});

describe('suma combinada (producto elegido)', () => {
  const eleg: Array<'AD' | 'RM' | 'IG' | 'MB' | 'NP'> = ['AD', 'RM', 'IG', 'MB', 'NP', 'AD', 'RM'];
  const ases = [
    { parentesco: 'TITULAR' as const, edad: 30, sexo: 'MASCULINO' as const },
    { parentesco: 'CONYUGE' as const, edad: 28, sexo: FCM },
    { parentesco: 'DEPENDIENTE' as const, edad: 5, sexo: 'MASCULINO' as const },
    { parentesco: 'DEPENDIENTE' as const, edad: 20, sexo: FSM },
    { parentesco: 'DEPENDIENTE' as const, edad: 24, sexo: 'MASCULINO' as const },
    { parentesco: 'DEPENDIENTE' as const, edad: 25, sexo: FSM },
    { parentesco: 'DEPENDIENTE' as const, edad: 0, sexo: 'MASCULINO' as const },
  ].map((a, i) => ({ ...a, productoElegido: eleg[i]! }));

  it('mensual 1.768, anual 21.216 y contado 20.629 (redondeo una sola vez, decisión P3)', () => {
    const r = calcular(base({ asegurados: ases }));
    expect(r.combinada?.mensual.toNumber()).toBe(1768 + 0);
    expect(r.combinada?.anual.toNumber()).toBe(21216);
    expect(r.combinada?.contado.toNumber()).toBe(20629);   // 20.628,61 → 20.629 (por producto y luego suma sería 20.631)
    const porProducto = r.combinada!.porProducto.map((x) => x.contado.toNumber()).sort((a, b) => a - b);
    expect(porProducto).toEqual([306, 480, 796, 5406, 13643]);   // cada producto conserva su contado redondeado
  });
  it('ignora el SARS por defecto (R2) y lo incluye si el parámetro se activa', () => {
    const e = base({ asegurados: ases, aplicaSars: true });
    const sin = calcular(e).combinada!.mensual.toNumber();
    expect(sin).toBe(1768);
    const r = cotizar(e, tarifas, { ...PARAMETROS_INICIALES, combinadaIncluyeSars: true });
    expect(r.ok && r.resultado.combinada!.mensual.toNumber()).toBeGreaterThan(1768);
  });
  it('sin producto elegido no hay combinada', () => {
    expect(calcular(base()).combinada).toBeUndefined();
  });
});
