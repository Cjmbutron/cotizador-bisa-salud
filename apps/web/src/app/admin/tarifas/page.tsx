'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import Errores, { mensajesDe } from '@/componentes/Errores';
import Shell from '@/componentes/Shell';
import { api } from '@/lib/api';
import { CLASE, ESTADO, type Version } from '@/lib/versiones';
import { ROLES_ADMIN, tieneRol, useYo } from '@/lib/yo';



export default function Pagina() { return <Shell><Tarifas /></Shell>; }

function Tarifas() {
  const yo = useYo();
  const [v, setV] = useState<Version[] | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState({ nombre: '', vigenteDesde: '', respaldoDocumental: '', copiarDe: '' });
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(() => api<Version[]>('/admin/tarifas/versiones').then(setV).catch((e) => setErrores(mensajesDe(e))), []);
  useEffect(() => { cargar(); }, [cargar]);

  if (!tieneRol(yo, ...ROLES_ADMIN)) return <p className="error">No tiene acceso a esta sección.</p>;
  const vigente = v?.find((x) => x.estado === 'PUBLICADA' && x.vigenteHasta === null) ?? v?.find((x) => x.estado === 'PUBLICADA');

  async function crear(e: React.FormEvent) {
    e.preventDefault(); setOcupado(true); setErrores([]);
    try {
      const r = await api<{ id: string }>('/admin/tarifas/versiones', { cuerpo: { ...f, copiarDe: f.copiarDe || undefined } });
      window.location.href = `/admin/tarifas/${r.id}`;
    } catch (x) { setErrores(mensajesDe(x)); } finally { setOcupado(false); }
  }

  return (
    <>
      <h1>Versiones de tarifas</h1>
      <p className="sub">Una versión nueva se prepara como borrador, la envía quien la creó y la publica otra persona.</p>
      <Errores mensajes={errores} />
      {tieneRol(yo, 'ADMIN_TARIFAS') && !abierto && <button className="primario" onClick={() => setAbierto(true)}>Nueva versión</button>}
      {abierto && (
        <form className="tarjeta" onSubmit={crear}>
          <div className="rejilla">
            <div><label htmlFor="n">Nombre</label><input id="n" required minLength={3} value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></div>
            <div><label htmlFor="d">Vigente desde (debe ser posterior a hoy)</label><input id="d" type="date" required value={f.vigenteDesde} onChange={(e) => setF({ ...f, vigenteDesde: e.target.value })} /></div>
            <div><label htmlFor="c">Partir de</label>
              <select id="c" value={f.copiarDe} onChange={(e) => setF({ ...f, copiarDe: e.target.value })}>
                <option value="">Versión vacía</option>{v?.map((x) => <option key={x.id} value={x.id}>{x.nombre}{x === vigente ? ' (vigente)' : ''}</option>)}</select></div>
            <div style={{ gridColumn: '1 / -1' }}><label htmlFor="r">Respaldo documental (oficio, circular, carta de la aseguradora)</label>
              <input id="r" required minLength={3} value={f.respaldoDocumental} onChange={(e) => setF({ ...f, respaldoDocumental: e.target.value })} /></div>
          </div>
          <div className="acciones"><button type="button" onClick={() => setAbierto(false)}>Cancelar</button><button className="primario" disabled={ocupado}>Crear borrador</button></div>
        </form>
      )}
      <div className="tarjeta tabla-scroll" style={{ marginTop: 16 }}>
        <table>
          <thead><tr><th>Versión</th><th>Estado</th><th>Vigencia</th><th>Creó</th><th>Aprobó</th><th className="num">Tarifas</th></tr></thead>
          <tbody>{v?.map((x) => (
            <tr key={x.id}>
              <td><Link href={`/admin/tarifas/${x.id}`}>{x.nombre}</Link></td>
              <td><span className={`insignia ${CLASE[x.estado]}`}>{ESTADO[x.estado]}</span></td>
              <td>{x.vigenteDesde} → {x.vigenteHasta ?? 'sin fin'}</td><td>{x.creadoPor ?? '—'}</td><td>{x.aprobadoPor ?? '—'}</td><td className="num">{x.tarifas.toLocaleString('es-BO')}</td>
            </tr>))}</tbody>
        </table>
      </div>
    </>
  );
}
