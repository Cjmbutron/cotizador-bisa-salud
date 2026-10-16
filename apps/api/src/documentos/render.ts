import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ErrorExcel, evaluar, aTexto, textoNumero } from './formula';
import type { EntornoFormula, Valor } from './formula';
import { DIR_PLANTILLAS, letraColumna } from './plantilla';
import type { Anclaje, CeldaPlantilla, Plantilla } from './plantilla';

const ZONA = 'America/La_Paz';

/**
 * Correcciones a defectos del Excel (documentadas en el informe del Paso 7).
 * AD_CM!Q55 lee un libro externo ([2]COTIZADOR) y solo mira las filas 17 y 18 (titular y cónyuge): con maternidad
 * en una dependiente el Excel muestra #VALUE! en el sublímite de cesárea. La plantilla CM solo se usa cuando hay
 * maternidad, así que el valor correcto es siempre 1000.
 */
export const PARCHES: Record<string, Record<string, Valor>> = {
  AD_CM: { Q55: 1000 },
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function fechaLarga(d: Date): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(d);
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
  return `${g('day')} de ${MESES[g('month') - 1]} de ${g('year')}`;
}

const dos = (n: number) => n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Texto que muestra Excel para un valor con el formato de la celda. */
export function mostrar(v: Valor, nf: CeldaPlantilla['nf']): string {
  if (v === null) return '';
  if (v instanceof ErrorExcel) return v.codigo;
  if (v instanceof Date) return fechaLarga(v);
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'VERDADERO' : 'FALSO';
  switch (nf) {
    case 'ac': return v === 0 ? '-' : dos(v);
    case 'n2': return dos(v);
    case 'n0': return Math.round(v).toString();
    case 'pct': return `${Math.round(v * 100)}%`;
    case 'fecha': return fechaLarga(new Date((v - 25569) * 86400000));
    default: return textoNumero(v).replace('.', ',');
  }
}

export function escapar(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Construye el entorno de evaluación de una plantilla con los datos del cotizador virtual. */
export function entornoDe(p: Plantilla, cotizador: (coord: string) => Valor, hoy: Date): { valorDe(c: CeldaPlantilla): Valor; valorCoord(coord: string): Valor } {
  const porCoord = new Map<string, CeldaPlantilla | { v?: string | number; f?: CeldaPlantilla['f'] }>();
  for (const c of p.celdas) porCoord.set(`${letraColumna(p.origen.col + c.c)}${p.origen.fila + c.r}`, c);
  for (const [k, c] of Object.entries(p.aux)) porCoord.set(k, c);
  const memo = new Map<string, Valor>();
  const enCurso = new Set<string>();
  const entorno: EntornoFormula = {
    celda: (coord) => valorCoord(coord),
    cotizador,
    hoy: () => hoy,
  };
  function valorCoord(coord: string): Valor {
    if (memo.has(coord)) return memo.get(coord)!;
    const parche = PARCHES[p.clave];
    if (parche && coord in parche) return parche[coord]!;
    const c = porCoord.get(coord);
    if (!c) return null;
    if (enCurso.has(coord)) return new ErrorExcel('#REF!');
    enCurso.add(coord);
    const v = c.f ? evaluar(c.f, entorno) : (c.v ?? null);
    enCurso.delete(coord);
    memo.set(coord, v);
    return v;
  }
  return {
    valorCoord,
    valorDe: (c) => valorCoord(`${letraColumna(p.origen.col + c.c)}${p.origen.fila + c.r}`),
  };
}

const FUENTES: Record<string, string> = {
  calibri: "Carlito, Calibri, 'Liberation Sans', sans-serif",
  arial: "'Liberation Sans', Arial, sans-serif",
  'times new roman': "'Liberation Serif', 'Times New Roman', serif",
  tahoma: "'DejaVu Sans', Tahoma, sans-serif",
};
const fuente = (n?: string) => FUENTES[(n ?? 'calibri').toLowerCase()] ?? `'${n}', Carlito, 'Liberation Sans', sans-serif`;

const imgCache = new Map<string, string>();
function dataUri(archivo: string): string {
  let u = imgCache.get(archivo);
  if (!u) {
    const ext = archivo.split('.').pop()!.toLowerCase();
    const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
    u = `data:${mime};base64,${readFileSync(join(DIR_PLANTILLAS, 'img', archivo)).toString('base64')}`;
    imgCache.set(archivo, u);
  }
  return u;
}

function estilo(c: CeldaPlantilla, valor: Valor): string {
  const s = c.s ?? {};
  const css: string[] = [];
  css.push(`font-family:${fuente(s.f)}`);
  css.push(`font-size:${s.sz ?? 11}pt`);
  if (s.b) css.push('font-weight:700');
  if (s.i) css.push('font-style:italic');
  if (s.u) css.push('text-decoration:underline');
  if (s.c) css.push(`color:${s.c}`);
  if (s.bg) css.push(`background:${s.bg}`);
  const num = typeof valor === 'number';
  const h = s.h === 'centerContinuous' ? 'center' : s.h && s.h !== 'general' ? s.h : num ? 'right' : 'left';
  css.push(`text-align:${h}`);
  css.push(`vertical-align:${s.v === 'center' ? 'middle' : s.v === 'top' ? 'top' : 'bottom'}`);
  if (s.w) css.push('white-space:pre-wrap;word-break:break-word'); else css.push('white-space:pre;overflow:visible');
  if (s.in) css.push(`padding-left:${s.in * 9}px`);
  if (s.bt) css.push(`border-top:${s.bt}`);
  if (s.br) css.push(`border-right:${s.br}`);
  if (s.bb) css.push(`border-bottom:${s.bb}`);
  if (s.bl) css.push(`border-left:${s.bl}`);
  return css.join(';');
}

export interface OpcionesRender {
  marcaAgua?: string;
  hoy: Date;
}

/** Dibuja la plantilla como una tabla HTML con las mismas combinaciones, anchos, alturas e imágenes del Excel. */
export function renderizarHtml(p: Plantilla, cotizador: (coord: string) => Valor, op: OpcionesRender): { html: string; anchoPx: number } {
  const ev = entornoDe(p, cotizador, op.hoy);
  const nCols = p.columnas.length;
  const nFilas = p.filas.length;
  const colVisible = p.columnas.map((c) => c.px > 0);
  const filaVisible = p.filas.map((f) => f.px > 0);
  const anchoPx = p.columnas.reduce((a, c) => a + c.px, 0);

  const celdas = new Map<string, CeldaPlantilla>();
  for (const c of p.celdas) celdas.set(`${c.r},${c.c}`, c);

  // posición acumulada (para las imágenes)
  const x0: number[] = [0]; for (const c of p.columnas) x0.push(x0[x0.length - 1]! + c.px);
  const y0: number[] = [0]; for (const f of p.filas) y0.push(y0[y0.length - 1]! + f.px);

  const cubiertas = new Set<string>();
  const filasHtml: string[] = [];
  for (let r = 0; r < nFilas; r++) {
    if (!filaVisible[r]) continue;
    const tds: string[] = [];
    for (let c = 0; c < nCols; c++) {
      if (!colVisible[c] || cubiertas.has(`${r},${c}`)) continue;
      const cel = celdas.get(`${r},${c}`);
      if (!cel) { tds.push('<td></td>'); continue; }
      const cs = cel.cs ?? 1; const rs = cel.rs ?? 1;
      let spanC = 0; for (let k = c; k < c + cs; k++) if (colVisible[k]) spanC++;
      let spanR = 0; for (let k = r; k < r + rs; k++) if (filaVisible[k]) spanR++;
      for (let rr = r; rr < r + rs; rr++) for (let cc = c; cc < c + cs; cc++) if (rr !== r || cc !== c) cubiertas.add(`${rr},${cc}`);
      const valor = ev.valorDe(cel);
      const texto = cel.rt && !cel.f
        ? cel.rt.map((u) => {
            const st = [u.sz ? `font-size:${u.sz}pt` : '', u.b ? 'font-weight:700' : '', u.i ? 'font-style:italic' : '', u.c ? `color:${u.c}` : ''].filter(Boolean).join(';');
            return st ? `<span style="${st}">${escapar(u.t)}</span>` : escapar(u.t);
          }).join('')
        : escapar(mostrar(valor, cel.nf));
      const attrs = `${spanC > 1 ? ` colspan="${spanC}"` : ''}${spanR > 1 ? ` rowspan="${spanR}"` : ''}`;
      tds.push(`<td${attrs} style="${estilo(cel, valor)}">${texto}</td>`);
    }
    const salto = p.cortes.includes(r) ? ' class="corte"' : '';
    filasHtml.push(`<tr${salto} style="height:${p.filas[r]!.px}px">${tds.join('')}</tr>`);
  }

  const caja = (a: Anclaje) => {
    const left = x0[a.col]! + a.dx;
    const top = y0[a.fila]! + a.dy;
    const w = a.col2 != null ? x0[a.col2]! + (a.dx2 ?? 0) - left : (a.ancho ?? 0);
    const h = a.fila2 != null ? y0[a.fila2]! + (a.dy2 ?? 0) - top : (a.alto ?? 0);
    return { left, top, w: Math.max(w, 1), h: Math.max(h, 1) };
  };
  const imgs = p.imagenes.map((im) => {
    const { left, top, w, h } = caja(im);
    const r = im.recorte;
    if (!r || (!r.l && !r.t && !r.r && !r.b)) {
      return `<img src="${dataUri(im.archivo)}" style="position:absolute;left:${left}px;top:${top}px;width:${w}px;height:${h}px">`;
    }
    // recorte de Excel: se muestra la parte central ampliada dentro de una ventana del tamaño del anclaje
    const wt = w / (1 - r.l - r.r); const ht = h / (1 - r.t - r.b);
    return `<div style="position:absolute;left:${left}px;top:${top}px;width:${w}px;height:${h}px;overflow:hidden"><img src="${dataUri(im.archivo)}" style="position:absolute;left:${-r.l * wt}px;top:${-r.t * ht}px;width:${wt}px;height:${ht}px"></div>`;
  });
  const formas = p.formas.map((f) => {
    const { left, top, w, h } = caja(f);
    const [li, ti, ri, bi] = f.ins;
    const alin: Record<string, string> = { l: 'left', ctr: 'center', r: 'right', just: 'justify' };
    const vert = f.ancla === 'ctr' ? 'center' : f.ancla === 'b' ? 'flex-end' : 'flex-start';
    const pars = f.parrafos.map((pa) => {
      const runs = pa.runs.map((u) => {
        const st = [`font-size:${u.sz ?? 11}pt`, u.b ? 'font-weight:700' : '', u.i ? 'font-style:italic' : '', u.u ? 'text-decoration:underline' : '', u.c ? `color:${u.c}` : ''].filter(Boolean).join(';');
        return `<span style="${st}">${escapar(u.t)}</span>`;
      }).join('');
      return `<div style="text-align:${alin[pa.h] ?? 'left'};min-height:1em">${runs || '&nbsp;'}</div>`;
    }).join('');
    return `<div style="position:absolute;left:${left}px;top:${top}px;width:${w}px;height:${h}px;display:flex;flex-direction:column;justify-content:${vert};padding:${ti}px ${ri}px ${bi}px ${li}px;box-sizing:border-box;overflow:hidden;font-family:${fuente()};line-height:1.2;${f.fondo ? `background:${f.fondo}` : ''}">${pars}</div>`;
  });

  const cols = p.columnas.filter((c) => c.px > 0).map((c) => `<col style="width:${c.px}px">`).join('');
  const marca = op.marcaAgua
    ? `<div class="marca">${escapar(op.marcaAgua).replace(/\n/g, '<br>')}</div>`
    : '';
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:#fff}
.hoja{position:relative;width:${anchoPx}px}
table{border-collapse:collapse;table-layout:fixed;width:${anchoPx}px}
td{padding:0 2px;overflow:hidden;line-height:1.15;box-sizing:border-box}
tr{break-inside:avoid}
tr.corte{break-before:page}
.marca{position:fixed;left:0;right:0;top:38%;text-align:center;transform:rotate(-28deg);font:700 54px 'Liberation Sans',Arial,sans-serif;color:rgba(200,30,30,.16);pointer-events:none;z-index:50;line-height:1.2}
</style></head><body>${marca}<div class="hoja"><table><colgroup>${cols}</colgroup><tbody>${filasHtml.join('')}</tbody></table>${imgs.join('')}${formas.join('')}</div></body></html>`;
  return { html, anchoPx };
}


