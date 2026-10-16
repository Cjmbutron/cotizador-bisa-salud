export interface FilaCsv { plan: string; region?: string; sexo?: string; edad: number; prima: number | null }

/**
 * Lee tarifas desde texto con columnas: plan,region,sexo,edad,prima (también acepta tabulaciones, para pegar desde Excel).
 * Prima vacía o "N/A" = sin tarifa. El decimal es punto. Devuelve filas o la lista de errores por línea.
 */
export function leerTarifasCsv(texto: string): { filas: FilaCsv[]; errores: string[] } {
  const lineas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const errores: string[] = []; const filas: FilaCsv[] = [];
  if (!lineas.length) return { filas, errores: ['No hay datos.'] };
  const sep = lineas[0]!.includes('\t') ? '\t' : lineas[0]!.includes(';') ? ';' : ',';
  const cab = lineas[0]!.split(sep).map((c) => c.trim().toLowerCase());
  const esperado = ['plan', 'region', 'sexo', 'edad', 'prima'];
  if (cab.join() !== esperado.join()) return { filas, errores: [`La primera línea debe ser el encabezado: ${esperado.join(sep)}`] };
  lineas.slice(1).forEach((l, i) => {
    const n = i + 2; const c = l.split(sep).map((x) => x.trim());
    if (c.length !== 5) { errores.push(`Línea ${n}: se esperan 5 columnas y hay ${c.length}.`); return; }
    const [plan, region, sexo, edad, prima] = c as [string, string, string, string, string];
    if (!plan) { errores.push(`Línea ${n}: falta el plan.`); return; }
    if (!/^\d{1,2}$/.test(edad)) { errores.push(`Línea ${n}: edad inválida "${edad}".`); return; }
    let p: number | null = null;
    if (prima !== '' && prima.toUpperCase() !== 'N/A') {
      if (!/^\d+(\.\d+)?$/.test(prima)) { errores.push(`Línea ${n}: prima inválida "${prima}" (use punto decimal, sin separador de miles).`); return; }
      p = Number(prima);
    }
    filas.push({ plan, ...(region ? { region } : {}), ...(sexo ? { sexo } : {}), edad: Number(edad), prima: p });
  });
  return { filas, errores: errores.slice(0, 20).concat(errores.length > 20 ? [`… y ${errores.length - 20} errores más.`] : []) };
}
