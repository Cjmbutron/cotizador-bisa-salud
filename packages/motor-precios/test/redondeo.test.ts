import { describe, expect, it } from 'vitest';
import { redondear, techo } from '../src/index.js';

describe('redondeo', () => {
  it('redondear: la mitad hacia arriba, como REDONDEAR de Excel', () => {
    expect(redondear(2.5).toNumber()).toBe(3);
    expect(redondear(2.4999).toNumber()).toBe(2);
    expect(redondear(0.5).toNumber()).toBe(1);
  });
  it('techo: entero inmediato superior; un entero no cambia', () => {
    expect(techo(37.8).toNumber()).toBe(38);
    expect(techo(87.6667).toNumber()).toBe(88);
    expect(techo(44).toNumber()).toBe(44);
    expect(techo(6097.572).toNumber()).toBe(6098);
  });
  it('techo no sufre errores de coma flotante (0.1+0.2)', () => {
    expect(techo(0.1 + 0.2 - 0.3).toNumber()).toBe(1); // 5.5e-17 > 0 → 1, comportamiento esperado de un techo
    expect(techo('1.000000').toNumber()).toBe(1);
  });
});
