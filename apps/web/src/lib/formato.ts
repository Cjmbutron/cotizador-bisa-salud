const MONEDA = { USD: 'USD', BOB: 'Bs.' } as const;

/** Los importes llegan como texto decimal exacto; solo se convierten para mostrarlos. */
export function importe(v: string | undefined | null, moneda?: 'USD' | 'BOB'): string {
  if (v === undefined || v === null) return '—';
  const n = Number(v);
  const s = n.toLocaleString('es-BO', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
  return moneda ? `${MONEDA[moneda]} ${s}` : s;
}

export const ETIQUETA_SEXO = {
  MASCULINO: 'Masculino', FEMENINO_SIN_MATERNIDAD: 'Femenino sin maternidad', FEMENINO_CON_MATERNIDAD: 'Femenino con maternidad',
} as const;
export const ETIQUETA_PARENTESCO = { TITULAR: 'Titular', CONYUGE: 'Cónyuge', DEPENDIENTE: 'Dependiente' } as const;
export const ETIQUETA_ESTADO = { OK: 'OK', NO_DISPONIBLE: 'No disponible', EXCLUIDO: 'Excluido' } as const;
