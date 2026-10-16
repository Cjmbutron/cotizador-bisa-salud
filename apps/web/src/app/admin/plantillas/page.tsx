'use client';
import { useCallback, useEffect, useState } from 'react';
import Errores, { mensajesDe } from '@/componentes/Errores';
import Shell from '@/componentes/Shell';
import { api } from '@/lib/api';
import { ROLES_PLANTILLAS, tieneRol, useYo } from '@/lib/yo';

interface Plantilla {
  id: string; clave: string; producto: string; variante: string | null; conMaternidad: boolean | null;
  textoAprobado: boolean; aprobacionCaducada: boolean; aprobadoEn: string | null; aprobadoPor: string | null;
}

export default function Pagina() { return <Shell><Plantillas /></Shell>; }

function Plantillas() {
  const yo = useYo();
  const [ps, setPs] = useState<Plantilla[] | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState('');
  const cargar = useCallback(() => api<Plantilla[]>('/admin/plantillas').then(setPs).catch((e) => setErrores(mensajesDe(e))), []);
  useEffect(() => { cargar(); }, [cargar]);
  if (!tieneRol(yo, ...ROLES_PLANTILLAS)) return <p className="error">No tiene acceso a esta sección.</p>;
  const reviso = tieneRol(yo, 'REVISOR_COMERCIAL');

  async function cambiar(p: Plantilla, accion: 'aprobar' | 'revocar') {
    setOcupado(p.id); setErrores([]);
    try { await api(`/admin/plantillas/${p.id}/${accion}`, { metodo: 'POST', cuerpo: {} }); await cargar(); }
    catch (e) { setErrores(mensajesDe(e)); } finally { setOcupado(''); }
  }
  const estado = (p: Plantilla) => p.textoAprobado ? 'Aprobado' : p.aprobacionCaducada ? 'Aprobación caducada (el texto cambió)' : 'Provisional';

  return (
    <>
      <h1>Plantillas de propuesta</h1>
      <p className="sub">El texto de las 13 plantillas se copió del Excel. Mientras el área comercial no lo apruebe, cada PDF lleva la marca «TEXTO PROVISIONAL». Si el contenido de una plantilla cambia, su aprobación deja de valer.</p>
      <Errores mensajes={errores} />
      <div className="tarjeta">
        <table>
          <thead><tr><th>Plantilla</th><th>Producto</th><th>Maternidad</th><th>Estado del texto</th><th>Aprobado por</th>{reviso && <th />}</tr></thead>
          <tbody>
            {(ps ?? []).map((p) => (
              <tr key={p.id}>
                <td>{p.clave}</td><td>{p.producto}{p.variante ? ` ${p.variante}` : ''}</td>
                <td>{p.conMaternidad === null ? 'No aplica' : p.conMaternidad ? 'Con' : 'Sin'}</td>
                <td>{estado(p)}</td>
                <td>{p.aprobadoPor ? `${p.aprobadoPor} · ${new Date(p.aprobadoEn!).toLocaleDateString('es-BO')}` : '—'}</td>
                {reviso && <td>{p.textoAprobado
                  ? <button disabled={ocupado === p.id} onClick={() => cambiar(p, 'revocar')}>Revocar</button>
                  : <button className="primario" disabled={ocupado === p.id} onClick={() => cambiar(p, 'aprobar')}>Aprobar texto</button>}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
