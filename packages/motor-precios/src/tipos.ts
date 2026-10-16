import type Decimal from 'decimal.js';

export type Regional = 'LPZ' | 'CBBA' | 'SCZ' | 'CHQ' | 'TJA';
export type Sexo = 'MASCULINO' | 'FEMENINO_SIN_MATERNIDAD' | 'FEMENINO_CON_MATERNIDAD';
export type Parentesco = 'TITULAR' | 'CONYUGE' | 'DEPENDIENTE';
/** IG Infinity Green · RM Red Max · AD Advance · MB Mundial Blue · NP Naranja+ */
export type Producto = 'IG' | 'RM' | 'AD' | 'MB' | 'NP';
export type SexoTarifa = 'M' | 'F' | 'F-M';

export type PlanRedMax = 'RM_700K' | 'RM_140K' | 'RM_70K';
export type CoberturaMB = '1MM' | '2MM' | '5MM';
export type DeducibleMB = '1K' | '2K' | '3K' | '5K' | '10K' | '20K';
export type AmbitoNP = 'BOLIVIA' | 'MUNDIAL_CON_BOLIVIA';

export interface Asegurado {
  parentesco: Parentesco;
  /** Entero de 0 a 99. */
  edad: number;
  sexo: Sexo;
  /** Solo para la suma combinada. */
  productoElegido?: Producto;
}

export interface EntradaCotizacion {
  regional: Regional;
  aplicaSars: boolean;
  productos: Producto[];
  asegurados: Asegurado[];
  redMax?: { plan: PlanRedMax };
  mundialBlue?: { cobertura: CoberturaMB; deducible: DeducibleMB; numeroHijos?: number };
  naranjaPlus?: { ambito: AmbitoNP; valorAsegurado: string; deducible: string };
}

// ---------------------------------------------------------------- salida
export type Estado = 'OK' | 'NO_DISPONIBLE' | 'EXCLUIDO';

export interface PasoCalculo {
  paso: string;
  valor?: string;
}

export interface Linea {
  aseguradoIdx: number;
  producto: Producto;
  estado: Estado;
  motivo?: string;
  primaBase?: Decimal;
  recargoMaternidad?: Decimal;
  recargoSars?: Decimal;
  primaMensual?: Decimal;
  primaMensualSinSars?: Decimal;
  detalle: PasoCalculo[];
}

export interface TotalProducto {
  producto: Producto;
  mensual: Decimal;
  anual: Decimal;
  contado: Decimal;
}

export interface Combinada {
  mensual: Decimal;
  anual: Decimal;
  contado: Decimal;
  porProducto: TotalProducto[];
}

export interface ErrorValidacion {
  codigo: 'V01' | 'V02' | 'V03' | 'V04' | 'V05' | 'V06' | 'V07';
  mensaje: string;
  aseguradoIdx?: number;
}

export interface ResultadoCotizacion {
  lineas: Linea[];
  totales: TotalProducto[];
  combinada?: Combinada;
}

export type RespuestaCotizar =
  | { ok: true; resultado: ResultadoCotizacion }
  | { ok: false; errores: ErrorValidacion[] };

// ---------------------------------------------------------------- datos que recibe el motor
/** Tarifas de una versión publicada, ya cargadas en memoria. Los índices de los arreglos son la edad. */
export interface PaqueteTarifas {
  /** [regional][IG|RM|AD][sexoTarifa] -> prima mensual por edad 0..99 (null = N/A). RM es la tarifa del plan de Bs. 700.000. */
  igr: Record<Regional, Record<'IG' | 'RM' | 'AD', Record<SexoTarifa, Array<number | null>>>>;
  /** "1MM_5K" -> prima mensual por edad 0..99 (solo 18..99 tienen dato). */
  mbAdulto: Record<string, Array<number | null>>;
  /** "1MM_5K" -> [numero de hijos 1..5] -> prima por hijo. Índice 0 sin uso. */
  mbHijo: Record<string, Array<number | null>>;
  /** "MB_1MM_10K" -> prima ANUAL por edad 0..84. Clave: ámbito corto (L | MB) + valor asegurado + deducible. */
  np: Record<string, Array<number | null>>;
  /** Combinaciones de Naranja+ ofrecidas por ámbito. */
  catalogoNP: Record<AmbitoNP, { valoresAsegurados: string[]; deducibles: string[]; codigo: 'L' | 'MB' }>;
}

export interface Parametros {
  rmDescuento: Record<PlanRedMax, number>;
  sars: { IG: number; RM: number };
  maternidadRecargo: { IG: number; RM: number };
  maternidadEdad: { min: number; max: number };
  contadoFactor: { IG: number; RM: number; AD: number; MB: number };
  /** Naranja+: contado = anual / divisor. */
  contadoDivisorNP: number;
  mbEdadAdulto: { titularConyuge: number; dependiente: number };
  np: { divisor: number; factor1: number; factor2: number; edadMax: number; exclusionMaternidadEdadMax: number };
  combinadaIncluyeSars: boolean;
  /** P1 (abierto): true = Advance usa el valor de la tabla fuera de 19..49 con maternidad (Excel actual); false = "No disponible". */
  advanceMaternidadUsaTabla: boolean;
  edadMaxima: number;
  maxAsegurados: number;
}

export const PARAMETROS_INICIALES: Parametros = {
  rmDescuento: { RM_700K: 0, RM_140K: 28, RM_70K: 49 },
  sars: { IG: 10, RM: 70 },
  maternidadRecargo: { IG: 20, RM: 140 },
  maternidadEdad: { min: 19, max: 49 },
  contadoFactor: { IG: 0.975, RM: 0.975, AD: 0.975, MB: 0.909 },
  contadoDivisorNP: 1.1,
  mbEdadAdulto: { titularConyuge: 18, dependiente: 25 },
  np: { divisor: 1.2675, factor1: 1.3, factor2: 1.1, edadMax: 64, exclusionMaternidadEdadMax: 18 },
  combinadaIncluyeSars: false,
  advanceMaternidadUsaTabla: false,
  edadMaxima: 99,
  maxAsegurados: 7,
};
