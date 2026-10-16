import { describe, expect, it } from 'vitest';
import { cotizar } from '../src/index.js';
import { base, tarifas, una } from './ayudas.js';

const codigos = (e: Parameters<typeof cotizar>[0]) => {
  const r = cotizar(e, tarifas);
  return r.ok ? [] : r.errores.map((x) => x.codigo);
};

describe('validaciones de entrada', () => {
  it('entrada válida no tiene errores', () => expect(codigos(base())).toEqual([]));
  it('V01: más de 7, dos titulares, dos cónyuges, seis dependientes, vacío', () => {
    const dep = { parentesco: 'DEPENDIENTE' as const, edad: 10, sexo: 'MASCULINO' as const };
    const tit = { parentesco: 'TITULAR' as const, edad: 30, sexo: 'MASCULINO' as const };
    const con = { parentesco: 'CONYUGE' as const, edad: 30, sexo: 'MASCULINO' as const };
    expect(codigos(base({ asegurados: [tit, tit] }))).toContain('V01');
    expect(codigos(base({ asegurados: [tit, con, con] }))).toContain('V01');
    expect(codigos(base({ asegurados: [tit, con, dep, dep, dep, dep, dep, dep] }))).toContain('V01');
    expect(codigos(base({ asegurados: [] }))).toContain('V01');
  });
  it('V02: edad fuera de rango, decimal o NaN', () => {
    expect(codigos(una({ edad: 100 }))).toContain('V02');
    expect(codigos(una({ edad: -1 }))).toContain('V02');
    expect(codigos(una({ edad: 30.5 }))).toContain('V02');
    expect(codigos(una({ edad: NaN }))).toContain('V02');
    expect(codigos(una({ edad: 0 }))).toEqual([]);
    expect(codigos(una({ edad: 99 }))).toEqual([]);
  });
  it('V03: dependiente con maternidad', () => {
    expect(codigos(una({ parentesco: 'DEPENDIENTE', sexo: 'FEMENINO_CON_MATERNIDAD', edad: 20 }))).toContain('V03');
  });
  it('V04: falta el parámetro de un producto elegido', () => {
    const { redMax: _r, ...sinRM } = base();
    expect(codigos(sinRM as never)).toContain('V04');
    const { mundialBlue: _m, ...sinMB } = base();
    expect(codigos(sinMB as never)).toContain('V04');
    const { naranjaPlus: _n, ...sinNP } = base();
    expect(codigos(sinNP as never)).toContain('V04');
  });
  it('V05: menores en la nómina sin número de hijos', () => {
    const mb = { cobertura: '1MM' as const, deducible: '5K' as const };
    expect(codigos(una({ edad: 5, parentesco: 'DEPENDIENTE' }, { mundialBlue: mb }))).toContain('V05');
    expect(codigos(una({ edad: 5, parentesco: 'DEPENDIENTE' }, { mundialBlue: { ...mb, numeroHijos: 0 } }))).toContain('V05');
    expect(codigos(una({ edad: 5, parentesco: 'DEPENDIENTE' }, { mundialBlue: { ...mb, numeroHijos: 6 } }))).toContain('V05');
    // sin menores no hace falta
    expect(codigos(una({ edad: 40 }, { mundialBlue: mb }))).toEqual([]);
    // 24 años dependiente sigue siendo menor para MB; 24 años titular es adulto
    expect(codigos(una({ edad: 24, parentesco: 'DEPENDIENTE' }, { mundialBlue: mb }))).toContain('V05');
    expect(codigos(una({ edad: 24, parentesco: 'TITULAR' }, { mundialBlue: mb }))).toEqual([]);
  });
  it('V06: combinaciones de Naranja+ fuera de las listas del ámbito', () => {
    expect(codigos(base({ naranjaPlus: { ambito: 'BOLIVIA', valorAsegurado: '1MM', deducible: '5K' } }))).toContain('V06');
    expect(codigos(base({ naranjaPlus: { ambito: 'BOLIVIA', valorAsegurado: '50K', deducible: '50K' } }))).toContain('V06');
    expect(codigos(base({ naranjaPlus: { ambito: 'BOLIVIA', valorAsegurado: '50K', deducible: '5K' } }))).toEqual([]);
  });
  it('V07: producto elegido que no está entre los productos', () => {
    expect(codigos(una({ productoElegido: 'MB' }, { productos: ['IG'] }))).toContain('V07');
  });
  it('con errores no calcula nada', () => {
    const r = cotizar(una({ edad: 100 }), tarifas);
    expect(r.ok).toBe(false);
  });
});
