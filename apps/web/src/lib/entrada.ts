import type { AseguradoForm, Catalogo, FormCotizacion } from './tipos';

/** Convierte el formulario en la entrada que espera la API. No decide nada de negocio: eso lo hace el motor. */
export function aEntrada(f: FormCotizacion) {
  const entrada: Record<string, unknown> = {
    regional: f.regional,
    aplicaSars: f.aplicaSars,
    productos: f.productos,
    asegurados: f.asegurados.map((a) => ({
      parentesco: a.parentesco,
      edad: Number(a.edad),
      sexo: a.sexo,
      ...(a.productoElegido ? { productoElegido: a.productoElegido } : {}),
    })),
  };
  if (f.productos.includes('RM')) entrada.redMax = { plan: f.redMaxPlan };
  if (f.productos.includes('MB')) {
    entrada.mundialBlue = {
      cobertura: f.mbCobertura, deducible: f.mbDeducible,
      ...(f.mbNumeroHijos !== '' ? { numeroHijos: Number(f.mbNumeroHijos) } : {}),
    };
  }
  if (f.productos.includes('NP')) entrada.naranjaPlus = { ambito: f.npAmbito, valorAsegurado: f.npValor, deducible: f.npDeducible };
  return entrada;
}

/** Lo que falta para poder calcular (el nombre del titular no hace falta: solo se exige al guardar). Las reglas de negocio las valida el motor. */
export function faltantesParaCalcular(f: FormCotizacion): string[] {
  const p: string[] = [];
  if (f.productos.length === 0) p.push('Seleccione al menos un producto.');
  f.asegurados.forEach((a, i) => {
    const quien = a.parentesco === 'TITULAR' ? 'del titular' : `del asegurado ${i + 1}`;
    if (a.edad === '') p.push(`Falta la edad ${quien}.`);
    else if (!/^\d+$/.test(a.edad)) p.push(`La edad ${quien} debe ser un número entero.`);
  });
  if (!f.asegurados.some((a) => a.parentesco === 'TITULAR')) p.push('Debe haber un titular.');
  return p;
}

export const aseguradoNuevo = (parentesco: AseguradoForm['parentesco']): AseguradoForm => ({ parentesco, edad: '', sexo: 'MASCULINO' });

export function formInicial(cat: Catalogo): FormCotizacion {
  const mb = cat.planes.filter((p) => p.producto === 'MB');
  const np = cat.planes.filter((p) => p.producto === 'NP');
  const [, cob, ded] = /^MB_(\w+?)_(\w+)$/.exec(mb[0]?.codigo ?? '') ?? [];
  const [, , amb, va, nd] = /^NP_(L|MB)_(\w+?)_(\w+)$/.exec(np[0]?.codigo ?? '') ?? [];
  return {
    titularNombre: '', regional: cat.regiones[0]?.codigo ?? '', aplicaSars: false, productos: [],
    asegurados: [aseguradoNuevo('TITULAR')],
    redMaxPlan: 'RM_700K', mbCobertura: cob ?? '1MM', mbDeducible: ded ?? '5K', mbNumeroHijos: '',
    npAmbito: np[0]?.ambito ?? 'BOLIVIA', npValor: va ?? amb ?? '', npDeducible: nd ?? '',
  };
}

/** Opciones de Mundial Blue y Naranja+ salen de los planes activos del catálogo, no del código. */
export function opciones(cat: Catalogo) {
  const mb = cat.planes.filter((p) => p.producto === 'MB').map((p) => /^MB_(\w+?)_(\w+)$/.exec(p.codigo)!).filter(Boolean);
  const np = cat.planes.filter((p) => p.producto === 'NP').map((p) => ({ ambito: p.ambito!, m: /^NP_(?:L|MB)_(\w+?)_(\w+)$/.exec(p.codigo)! })).filter((x) => x.m);
  const unico = (a: string[]) => [...new Set(a)];
  return {
    mbCoberturas: unico(mb.map((m) => m[1]!)),
    mbDeducibles: unico(mb.map((m) => m[2]!)),
    npAmbitos: unico(np.map((x) => x.ambito)),
    npValores: (ambito: string) => unico(np.filter((x) => x.ambito === ambito).map((x) => x.m[1]!)),
    npDeducibles: (ambito: string) => unico(np.filter((x) => x.ambito === ambito).map((x) => x.m[2]!)),
    redMax: cat.planes.filter((p) => p.producto === 'RM'),
  };
}
