import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Nodo } from './formula';

export interface EstiloCelda {
  b?: 1; i?: 1; u?: 1; sz?: number; c?: string; f?: string; bg?: string;
  h?: string; v?: string; w?: 1; in?: number;
  bt?: string; br?: string; bb?: string; bl?: string;
}
export interface CeldaPlantilla {
  r: number; c: number; rs?: number; cs?: number;
  /** Valor guardado por Excel (texto fijo o resultado de la fórmula al extraer). */
  v?: string | number;
  /** Fórmula analizada. */
  f?: Nodo;
  /** g general · n0 entero · n2 dos decimales · ac contable · pct porcentaje · fecha */
  nf?: 'n0' | 'n2' | 'ac' | 'pct' | 'fecha';
  s?: EstiloCelda;
  /** Texto con partes de distinto formato (solo en celdas sin fórmula). */
  rt?: { t: string; b?: 1; i?: 1; sz?: number; c?: string }[];
}
export interface Anclaje {
  fila: number; col: number; dx: number; dy: number;
  fila2?: number; col2?: number; dx2?: number; dy2?: number; ancho?: number; alto?: number;
}
export interface ImagenPlantilla extends Anclaje {
  archivo: string;
  /** Recorte como fracción de cada lado (l, t, r, b). */
  recorte?: { l: number; t: number; r: number; b: number };
}
export interface FormaTexto extends Anclaje {
  parrafos: { h: string; runs: { t: string; sz?: number; b?: 1; i?: 1; u?: 1; c?: string }[] }[];
  ancla: string; ins: number[]; fondo?: string;
}
export interface Plantilla {
  clave: string; hoja: string;
  columnas: { px: number }[]; filas: { px: number }[];
  celdas: CeldaPlantilla[]; imagenes: ImagenPlantilla[]; formas: FormaTexto[]; cortes: number[];
  origen: { fila: number; col: number };
  aux: Record<string, { v?: string | number; f?: Nodo }>;
  escalaExcel: number | null;
}

export const DIR_PLANTILLAS = process.env.PLANTILLAS_DIR ?? join(__dirname, '..', '..', 'plantillas');
const cache = new Map<string, Plantilla>();

export function cargarPlantilla(clave: string): Plantilla {
  if (!/^[A-Z0-9_]+$/.test(clave)) throw new Error(`Clave de plantilla no válida: ${clave}`);
  let p = cache.get(clave);
  if (!p) {
    p = JSON.parse(readFileSync(join(DIR_PLANTILLAS, `${clave}.json`), 'utf8')) as Plantilla;
    cache.set(clave, p);
  }
  return p;
}

export function letraColumna(n: number): string {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}
export function numeroColumna(letras: string): number {
  return [...letras].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0);
}
