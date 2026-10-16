/**
 * Evaluador del subconjunto de fórmulas de Excel que usan las plantillas de propuesta:
 * IF, OR, TODAY, + - * /, & y comparaciones. Las fórmulas llegan ya analizadas (árbol) desde
 * scripts/extraer_plantillas.py.
 */

export class ErrorExcel {
  constructor(public readonly codigo: string) {}
  toString() { return this.codigo; }
}
export type Valor = string | number | boolean | Date | null | ErrorExcel;
export type Nodo = [string, ...unknown[]];

export interface EntornoFormula {
  /** Valor de una celda de la misma hoja (coordenada absoluta, p. ej. "D45"). */
  celda(coord: string): Valor;
  /** Valor de una celda de la hoja COTIZADOR. */
  cotizador(coord: string): Valor;
  hoy(): Date;
}

const VALUE = new ErrorExcel('#VALUE!');

function aNumero(v: Valor): number | ErrorExcel {
  if (v instanceof ErrorExcel) return v;
  if (v === null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.getTime() / 86400000 + 25569;
  const t = v.trim();
  if (t !== '' && !Number.isNaN(Number(t))) return Number(t);
  return VALUE;
}

export function aTexto(v: Valor): string {
  if (v === null) return '';
  if (v instanceof ErrorExcel) return v.codigo;
  if (typeof v === 'boolean') return v ? 'VERDADERO' : 'FALSO';
  if (typeof v === 'number') return textoNumero(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v;
}

/** Formato "General" de Excel: hasta 11 dígitos significativos, sin ceros sobrantes. */
export function textoNumero(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toPrecision(11)));
}

function comparar(op: string, a: Valor, b: Valor): boolean | ErrorExcel {
  if (a instanceof ErrorExcel) return a;
  if (b instanceof ErrorExcel) return b;
  // celda vacía: 0 frente a números, "" frente a texto
  let x: string | number | boolean = a instanceof Date ? aNumero(a) as number : a ?? (typeof b === 'string' ? '' : 0);
  let y: string | number | boolean = b instanceof Date ? aNumero(b) as number : b ?? (typeof a === 'string' ? '' : 0);
  if (typeof x === 'string' && typeof y === 'string') { x = x.toLowerCase(); y = y.toLowerCase(); }
  let c: number;
  if (typeof x === typeof y) c = x < y ? -1 : x > y ? 1 : 0;
  else c = rangoTipo(x) < rangoTipo(y) ? -1 : 1; // Excel: número < texto < lógico
  switch (op) {
    case '=': return c === 0;
    case '<>': return c !== 0;
    case '<': return c < 0;
    case '>': return c > 0;
    case '<=': return c <= 0;
    default: return c >= 0;
  }
}
const rangoTipo = (x: unknown) => (typeof x === 'number' ? 0 : typeof x === 'string' ? 1 : 2);

function logico(v: Valor): boolean | ErrorExcel {
  if (v instanceof ErrorExcel) return v;
  if (typeof v === 'boolean') return v;
  if (v === null) return false;
  if (typeof v === 'number') return v !== 0;
  return VALUE;
}

export function evaluar(n: Nodo, e: EntornoFormula): Valor {
  switch (n[0]) {
    case 's': return n[1] as string;
    case 'n': return n[1] as number;
    case 'err': return new ErrorExcel('#REF!');
    case 'c': return e.celda(n[1] as string);
    case 'x': return e.cotizador(n[1] as string);
    case 'today': return e.hoy();
    case 'neg': { const a = aNumero(evaluar(n[1] as Nodo, e)); return a instanceof ErrorExcel ? a : -a; }
    case 'cat': {
      const a = evaluar(n[1] as Nodo, e); const b = evaluar(n[2] as Nodo, e);
      if (a instanceof ErrorExcel) return a;
      if (b instanceof ErrorExcel) return b;
      return aTexto(a) + aTexto(b);
    }
    case 'bin': {
      const a = aNumero(evaluar(n[2] as Nodo, e)); const b = aNumero(evaluar(n[3] as Nodo, e));
      if (a instanceof ErrorExcel) return a;
      if (b instanceof ErrorExcel) return b;
      switch (n[1]) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        default: return b === 0 ? new ErrorExcel('#DIV/0!') : a / b;
      }
    }
    case 'cmp': return comparar(n[1] as string, evaluar(n[2] as Nodo, e), evaluar(n[3] as Nodo, e));
    case 'if': {
      const c = logico(evaluar(n[1] as Nodo, e));
      if (c instanceof ErrorExcel) return c;
      if (c) return n[2] ? evaluar(n[2] as Nodo, e) : true;
      return n[3] ? evaluar(n[3] as Nodo, e) : false;
    }
    case 'or': {
      let r = false;
      for (const a of n.slice(1) as Nodo[]) {
        const v = logico(evaluar(a, e));
        if (v instanceof ErrorExcel) return v;
        r = r || v;
      }
      return r;
    }
    default: throw new Error(`Función no soportada en plantilla: ${String(n[0])}`);
  }
}
