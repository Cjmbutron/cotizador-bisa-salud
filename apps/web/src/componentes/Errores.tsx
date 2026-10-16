import { ApiError } from '@/lib/api';

/** Traduce un error de la API a mensajes entendibles. */
export function mensajesDe(e: unknown): string[] {
  if (!(e instanceof ApiError)) return ['No se pudo conectar con el servidor. Intente de nuevo.'];
  const c = e.cuerpo ?? {};
  if (e.status === 422 && Array.isArray(c.errores)) {
    return c.errores.map((x: { codigo: string; mensaje: string; aseguradoIdx?: number }) =>
      x.aseguradoIdx !== undefined ? `Asegurado ${x.aseguradoIdx + 1}: ${x.mensaje}` : x.mensaje);
  }
  if (e.status === 400 && Array.isArray(c.detalle)) return c.detalle.map((d: { campo: string; mensaje: string }) => `${d.campo}: ${d.mensaje}`);
  if (e.status === 503) return ['El cotizador no tiene tarifas vigentes configuradas. Avise al área de tarifas.'];
  if (e.status === 403) return ['No tiene permiso para esta operación.'];
  return [c.mensaje ?? 'Ocurrió un error inesperado.'];
}

export default function Errores({ mensajes }: { mensajes: string[] }) {
  if (!mensajes.length) return null;
  return (
    <div className="error" role="alert">
      {mensajes.length === 1 ? mensajes[0] : <>Revise lo siguiente:<ul>{mensajes.map((m, i) => <li key={i}>{m}</li>)}</ul></>}
    </div>
  );
}
