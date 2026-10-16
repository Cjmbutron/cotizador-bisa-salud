import type { EntradaCotizacion, ErrorValidacion, PaqueteTarifas, Parametros } from './tipos.js';
import { esAdultoMB } from './util.js';

export function validar(e: EntradaCotizacion, tarifas: PaqueteTarifas, p: Parametros): ErrorValidacion[] {
  const errores: ErrorValidacion[] = [];
  const err = (codigo: ErrorValidacion['codigo'], mensaje: string, aseguradoIdx?: number) =>
    errores.push(aseguradoIdx === undefined ? { codigo, mensaje } : { codigo, mensaje, aseguradoIdx });

  // V01 composición de la nómina
  const cuenta = (x: string) => e.asegurados.filter((a) => a.parentesco === x).length;
  if (e.asegurados.length < 1 || e.asegurados.length > p.maxAsegurados)
    err('V01', `La nómina debe tener de 1 a ${p.maxAsegurados} asegurados`);
  if (cuenta('TITULAR') > 1) err('V01', 'Solo puede haber 1 titular');
  if (cuenta('CONYUGE') > 1) err('V01', 'Solo puede haber 1 cónyuge');
  if (cuenta('DEPENDIENTE') > 5) err('V01', 'Solo puede haber hasta 5 dependientes');

  e.asegurados.forEach((a, i) => {
    // V02 edad
    if (!Number.isInteger(a.edad) || a.edad < 0 || a.edad > p.edadMaxima)
      err('V02', `La edad debe ser un entero de 0 a ${p.edadMaxima}`, i);
    // V03 maternidad en dependientes
    if (a.parentesco === 'DEPENDIENTE' && a.sexo === 'FEMENINO_CON_MATERNIDAD')
      err('V03', 'Un dependiente no puede tener cobertura de maternidad', i);
    // V07 producto elegido
    if (a.productoElegido && !e.productos.includes(a.productoElegido))
      err('V07', `El producto elegido ${a.productoElegido} no está entre los productos a calcular`, i);
  });

  // V04 parámetros por producto
  if (e.productos.includes('RM') && !e.redMax) err('V04', 'Red Max requiere el plan (valor asegurado)');
  if (e.productos.includes('MB') && !e.mundialBlue) err('V04', 'Mundial Blue requiere cobertura y deducible');
  if (e.productos.includes('NP') && !e.naranjaPlus) err('V04', 'Naranja+ requiere ámbito, valor asegurado y deducible');

  // V05 número de hijos de Mundial Blue
  if (e.mundialBlue && e.productos.includes('MB')) {
    const hayMenores = e.asegurados.some((a) => !esAdultoMB(a, p));
    const h = e.mundialBlue.numeroHijos;
    if (hayMenores && (h === undefined || !Number.isInteger(h) || h < 1 || h > 5))
      err('V05', 'Hay asegurados menores: indique el número de hijos (1 a 5)');
  }

  // V06 combinaciones de Naranja+
  if (e.naranjaPlus && e.productos.includes('NP')) {
    const cat = tarifas.catalogoNP[e.naranjaPlus.ambito];
    if (!cat) err('V06', 'Ámbito de Naranja+ no válido');
    else {
      if (!cat.valoresAsegurados.includes(e.naranjaPlus.valorAsegurado))
        err('V06', `Valor asegurado ${e.naranjaPlus.valorAsegurado} no disponible en ${e.naranjaPlus.ambito}`);
      if (!cat.deducibles.includes(e.naranjaPlus.deducible))
        err('V06', `Deducible ${e.naranjaPlus.deducible} no disponible en ${e.naranjaPlus.ambito}`);
    }
  }
  return errores;
}
