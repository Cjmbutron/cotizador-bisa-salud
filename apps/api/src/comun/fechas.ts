/**
 * Suma días hábiles (lunes a viernes) a una fecha ISO yyyy-mm-dd.
 * REQUIERE VALIDACIÓN DEL NEGOCIO: no considera feriados nacionales/departamentales.
 */
export function sumarDiasHabiles(fechaIso: string, dias: number): string {
  const [a, m, d] = fechaIso.split('-').map(Number) as [number, number, number];
  const f = new Date(Date.UTC(a, m - 1, d));
  let restantes = dias;
  while (restantes > 0) {
    f.setUTCDate(f.getUTCDate() + 1);
    const dia = f.getUTCDay();
    if (dia !== 0 && dia !== 6) restantes--;
  }
  return f.toISOString().slice(0, 10);
}
