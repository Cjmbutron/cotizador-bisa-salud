'use client';
import { useCallback, useEffect, useState } from 'react';
import Errores, { mensajesDe } from '@/componentes/Errores';
import Shell from '@/componentes/Shell';
import { api } from '@/lib/api';
import { ROLES_ADMIN, tieneRol, useYo } from '@/lib/yo';

interface Param { clave: string; producto: string | null; plan: string | null; valor: number; tipo: string; descripcion: string | null; vigenteDesde: string; vigenteHasta: string | null }
const ambito = (p: Param) => p.producto ?? p.plan ?? '';
const id = (p: Param) => `${p.clave}|${ambito(p)}`;

export default function Pagina() { return <Shell><Parametros /></Shell>; }

function Parametros() {
  const yo = useYo();
  const [ps, setPs] = useState<Param[] | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const [ok, setOk] = useState('');
  const [sel, setSel] = useState<Param | null>(null);
  const [f, setF] = useState({ valor: '', vigenteDesde: '', motivo: '' });
  const [ocupado, setOcupado] = useState(false);
  const [historico, setHistorico] = useState(false);

  const cargar = useCallback(() => api<Param[]>('/admin/parametros').then(setPs).catch((e) => setErrores(mensajesDe(e))), []);
  useEffect(() => { cargar(); }, [cargar]);
  if (!tieneRol(yo, ...ROLES_ADMIN)) return <p className="error">No tiene acceso a esta sección.</p>;

  const hoy = new Date().toISOString().slice(0, 10);
  const visibles = (ps ?? []).filter((p) => historico || p.vigenteHasta === null || p.vigenteHasta > hoy);

  async function guardar(e: React.FormEvent) {
    e.preventDefault(); if (!sel) return;
    setOcupado(true); setErrores([]); setOk('');
    try {
      await api('/admin/parametros', { cuerpo: { clave: sel.clave, ...(sel.producto ? { producto: sel.producto } : {}), ...(sel.plan ? { plan: sel.plan } : {}), valor: Number(f.valor), vigenteDesde: f.vigenteDesde, motivo: f.motivo.trim() } });
      setOk('Parámetro programado.'); setSel(null); setF({ valor: '', vigenteDesde: '', motivo: '' }); await cargar();
    } catch (x) { setErrores(mensajesDe(x)); } finally { setOcupado(false); }
  }

  return (
    <>
      <h1>Parámetros</h1>
      <p className="sub">Un cambio rige desde una fecha futura; el valor actual no se modifica ni se borra. Quedan registrados con su motivo.</p>
      <Errores mensajes={errores} />
      {ok && <p className="exito" role="status">{ok}</p>}
      {sel && (
        <form className="tarjeta" onSubmit={guardar}>
          <h2 style={{ marginTop: 0 }}>{sel.clave} {ambito(sel) && `· ${ambito(sel)}`}</h2>
          <p className="sub">{sel.descripcion} Valor actual: <strong>{sel.valor}</strong> ({sel.tipo})</p>
          <div className="rejilla">
            <div><label htmlFor="v">Nuevo valor</label><input id="v" required inputMode="decimal" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} /></div>
            <div><label htmlFor="d">Rige desde (posterior a hoy)</label><input id="d" type="date" required value={f.vigenteDesde} onChange={(e) => setF({ ...f, vigenteDesde: e.target.value })} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label htmlFor="m">Motivo (queda en la auditoría)</label><input id="m" required minLength={5} value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} /></div>
          </div>
          <div className="acciones"><button type="button" onClick={() => setSel(null)}>Cancelar</button><button className="primario" disabled={ocupado || f.valor === '' || isNaN(Number(f.valor))}>Programar cambio</button></div>
        </form>
      )}
      <label className="marca" style={{ display: 'inline-flex', marginBottom: 12 }}><input type="checkbox" checked={historico} onChange={(e) => setHistorico(e.target.checked)} /> Ver también valores anteriores</label>
      <div className="tarjeta tabla-scroll">
        <table>
          <thead><tr><th>Parámetro</th><th>Aplica a</th><th className="num">Valor</th><th>Vigencia</th><th /></tr></thead>
          <tbody>{visibles.map((p) => (
            <tr key={`${id(p)}|${p.vigenteDesde}`}>
              <td>{p.clave}<div style={{ fontSize: 12, color: 'var(--suave)' }}>{p.descripcion}</div></td><td>{ambito(p) || 'General'}</td><td className="num">{p.valor}</td>
              <td>{p.vigenteDesde} → {p.vigenteHasta ?? 'sin fin'}</td>
              <td>{tieneRol(yo, 'ADMIN_TARIFAS') && p.vigenteHasta === null && <button onClick={() => { setSel(p); setOk(''); window.scrollTo({ top: 0 }); }}>Cambiar</button>}</td>
            </tr>))}</tbody>
        </table>
      </div>
    </>
  );
}
