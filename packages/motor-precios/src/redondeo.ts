import Decimal from 'decimal.js';

// Precisión suficiente para primas; el redondeo es explícito, nunca implícito.
const D = Decimal.clone({ precision: 40 });
export const dec = (v: Decimal.Value): Decimal => new D(v);

/** REDONDEAR(x; 0) de Excel: al entero, la mitad hacia arriba (valores positivos). */
export const redondear = (x: Decimal.Value): Decimal => dec(x).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

/** Entero inmediato superior (REDONDEAR.MAS de Excel y regla R6 del negocio). Si ya es entero, no cambia. */
export const techo = (x: Decimal.Value): Decimal => dec(x).toDecimalPlaces(0, Decimal.ROUND_CEIL);
