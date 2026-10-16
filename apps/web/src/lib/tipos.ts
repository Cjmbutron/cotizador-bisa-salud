export type Producto = 'IG' | 'RM' | 'AD' | 'MB' | 'NP';
export type Parentesco = 'TITULAR' | 'CONYUGE' | 'DEPENDIENTE';
export type Sexo = 'MASCULINO' | 'FEMENINO_SIN_MATERNIDAD' | 'FEMENINO_CON_MATERNIDAD';

export interface Catalogo {
  regiones: { codigo: string; nombre: string }[];
  productos: { codigo: Producto; nombre: string; moneda: 'USD' | 'BOB' }[];
  planes: { codigo: string; nombre: string; producto: Producto; ambito: string | null; valorAsegurado: string | null; deducible: string | null }[];
  parentescos: { codigo: Parentesco; nombre: string; maximo: number; permiteMaternidad: boolean }[];
}

export interface Linea {
  aseguradoIdx: number; producto: Producto; estado: 'OK' | 'NO_DISPONIBLE' | 'EXCLUIDO'; motivo?: string;
  primaBase?: string; recargoMaternidad?: string; recargoSars?: string; primaMensual?: string;
  detalle: { paso: string; valor?: string }[];
}
export interface Total { producto: Producto; mensual: string; anual: string; contado: string }
export interface Resultado { lineas: Linea[]; totales: Total[]; combinada?: { mensual: string; anual: string; contado: string } }
export interface RespuestaCalculo {
  versionTarifa: string; monedas: Record<string, 'USD' | 'BOB'>; advertencias: string[]; resultado: Resultado;
  id?: string; numero?: string; validaHasta?: string; estado?: string;
}
export interface ErrorValidacion { codigo: string; mensaje: string; aseguradoIdx?: number }

export interface AseguradoForm { parentesco: Parentesco; edad: string; sexo: Sexo; productoElegido?: Producto }
export interface FormCotizacion {
  titularNombre: string; regional: string; aplicaSars: boolean; productos: Producto[]; asegurados: AseguradoForm[];
  redMaxPlan: string; mbCobertura: string; mbDeducible: string; mbNumeroHijos: string;
  npAmbito: string; npValor: string; npDeducible: string;
}
