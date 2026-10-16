export class ApiError extends Error {
  constructor(public status: number, public cuerpo: any) {
    super(cuerpo?.mensaje ?? `Error ${status}`);
  }
}

const CLAVE = 'cotizador.token';
export const guardarToken = (t: string) => sessionStorage.setItem(CLAVE, t);
export const leerToken = () => (typeof window === 'undefined' ? null : sessionStorage.getItem(CLAVE));
export const cerrarSesion = () => { sessionStorage.removeItem(CLAVE); window.location.href = '/login'; };

export function correoDelToken(t: string | null): string | null {
  try { return t ? JSON.parse(atob(t.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))).email ?? null : null; } catch { return null; }
}

export async function api<T>(ruta: string, opts: { metodo?: string; cuerpo?: unknown } = {}): Promise<T> {
  const t = leerToken();
  const r = await fetch(`/api${ruta}`, {
    method: opts.metodo ?? (opts.cuerpo ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
    body: opts.cuerpo ? JSON.stringify(opts.cuerpo) : undefined,
  });
  if (r.status === 401) { cerrarSesion(); throw new ApiError(401, { mensaje: 'Sesión vencida' }); }
  const texto = await r.text();
  const cuerpo = texto ? JSON.parse(texto) : null;
  if (!r.ok) throw new ApiError(r.status, cuerpo);
  return cuerpo as T;
}

/** Pide un PDF a la API y lo baja con el nombre que indica el servidor. Devuelve si el texto es provisional. */
export async function descargarPdf(ruta: string): Promise<{ archivo: string; provisional: boolean }> {
  const t = leerToken();
  const r = await fetch(`/api${ruta}`, { method: 'POST', headers: t ? { Authorization: `Bearer ${t}` } : {} });
  if (r.status === 401) { cerrarSesion(); throw new ApiError(401, { mensaje: 'Sesión vencida' }); }
  if (!r.ok) { const txt = await r.text(); throw new ApiError(r.status, txt ? JSON.parse(txt) : null); }
  const archivo = decodeURIComponent(r.headers.get('X-Archivo') ?? 'Propuesta.pdf');
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement('a'); a.href = url; a.download = archivo; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return { archivo, provisional: r.headers.get('X-Texto-Provisional') === 'true' };
}
