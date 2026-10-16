'use client';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import Errores, { mensajesDe } from '@/componentes/Errores';
import Shell from '@/componentes/Shell';
import { api } from '@/lib/api';
import { leerTarifasCsv } from '@/lib/csv';
import { tieneRol, useYo } from '@/lib/yo';
import { CLASE, ESTADO, type Version } from '@/lib/versiones';

interface Cambio { plan: string; region: string | null; sexo: string | null; cambiadas: number; agregadas: number; eliminadas: number; minPct: string | null; maxPct: string | null }
const LOTE = 5000;

export default function Pagina() { return <Shell><Detalle /></Shell>; }

function Detalle() {
  const { id } = useParams<{ id: string }>();
  const yo = useYo();
  const [v, setV] = useState<Version | null>(null);
  const [problemas, setProblemas] = useState<string[] | null>(null);
  const [cmp, setCmp] = useState<{ contra: string | null; resumen: Cambio[] } | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const [ok, setOk] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [csv, setCsv] = useState('');
  const [motivo, setMotivo] = useState(''); const [devolviendo, setDevolviendo] = useState(false);
  const [una, setUna] = useState({ plan: '', region: '', sexo: '', edad: '', prima: '' });

  const cargar = useCallback(async () => {
    try {
      const todas = await api<Version[]>('/admin/tarifas/versiones');
      const x = todas.find((y) => y.id === id) ?? null; setV(x);
      if (x && x.estado !== 'ARCHIVADA') {
        if (tieneRol(yo, 'ADMIN_TARIFAS', 'APROBADOR_TARIFAS')) setProblemas((await api<{ problemas: string[] }>(`/admin/tarifas/versiones/${id}/revision`)).problemas);
        setCmp(await api(`/admin/tarifas/versiones/${id}/comparacion`));
      }
    } catch (e) { setErrores(mensajesDe(e)); }
  }, [id, yo]);
  useEffect(() => { cargar(); }, [cargar]);

  async function hacer(f: () => Promise<unknown>, mensaje: string) {
    setOcupado(true); setErrores([]); setOk('');
    try { await f(); setOk(mensaje); await cargar(); } catch (e) { setErrores(mensajesDe(e)); } finally { setOcupado(false); }
  }
  const post = (ruta: string, cuerpo?: unknown) => api(`/admin/tarifas/versiones/${id}/${ruta}`, { metodo: 'POST', cuerpo: cuerpo ?? {} });
  const put = (ruta: string, cuerpo: unknown) => api(`/admin/tarifas/versiones/${id}/${ruta}`, { metodo: 'PUT', cuerpo });

  if (!v) return <Errores mensajes={errores} />;
  const soyCreador = v.creadoPor === yo.email;
  const editable = v.estado === 'BORRADOR' && tieneRol(yo, 'ADMIN_TARIFAS');

  async function importar() {
    const { filas, errores: e } = leerTarifasCsv(csv);
    if (e.length) { setErrores(e); return; }
    // Por lotes: cada lote es todo-o-nada; si uno falla, los anteriores quedan guardados (se puede corregir y repetir).
    let n = 0;
    await hacer(async () => { for (let i = 0; i < filas.length; i += LOTE) { await put('tarifas', { filas: filas.slice(i, i + LOTE) }); n += Math.min(LOTE, filas.length - i); } setCsv(''); }, `Se guardaron ${filas.length} filas.`);
  }

  return (
    <>
      <h1>{v.nombre} <span className={`insignia ${CLASE[v.estado]}`}>{ESTADO[v.estado]}</span></h1>
      <p className="sub">Vigente {v.vigenteDesde} → {v.vigenteHasta ?? 'sin fin'} · creó {v.creadoPor ?? '—'}{v.aprobadoPor ? ` · aprobó ${v.aprobadoPor}` : ''} · {v.tarifas.toLocaleString('es-BO')} tarifas</p>
      <p className="sub">Respaldo: {v.respaldoDocumental ?? '—'}</p>
      <Errores mensajes={errores} />
      {ok && <p className="exito" role="status">{ok}</p>}

      {problemas && v.estado !== 'PUBLICADA' && (
        <div className={problemas.length ? 'aviso' : 'exito'}>
          {problemas.length ? <>La versión aún no está completa:<ul>{problemas.map((p) => <li key={p}>{p}</li>)}</ul></> : 'La versión está completa.'}
        </div>
      )}

      {cmp && (
        <div className="tarjeta">
          <h2 style={{ marginTop: 0 }}>Cambios respecto de {cmp.contra ?? '—'}</h2>
          {!cmp.contra || cmp.resumen.length === 0 ? <p className="sub">Sin diferencias.</p> : (
            <div className="tabla-scroll"><table>
              <thead><tr><th>Plan</th><th>Regional</th><th>Sexo</th><th className="num">Cambiadas</th><th className="num">Nuevas</th><th className="num">Quitadas</th><th className="num">Variación</th></tr></thead>
              <tbody>{cmp.resumen.map((c, i) => (
                <tr key={i}><td>{c.plan}</td><td>{c.region ?? '—'}</td><td>{c.sexo ?? '—'}</td><td className="num">{c.cambiadas}</td><td className="num">{c.agregadas}</td><td className="num">{c.eliminadas}</td>
                  <td className="num">{c.minPct !== null ? `${c.minPct}% a ${c.maxPct}%` : '—'}</td></tr>))}</tbody>
            </table></div>
          )}
        </div>
      )}

      {editable && (
        <>
          <div className="tarjeta">
            <h2 style={{ marginTop: 0 }}>Cambiar una tarifa</h2>
            <div className="rejilla">
              {(['plan', 'region', 'sexo', 'edad', 'prima'] as const).map((k) => (
                <div key={k}><label htmlFor={`u${k}`}>{{ plan: 'Plan (ej. IG, AD, RM_700K, MB_1MM_5K)', region: 'Regional (solo IG/RM/AD)', sexo: 'Sexo M, F o F-M (solo IG/RM/AD)', edad: 'Edad', prima: 'Prima (vacío = N/A)' }[k]}</label>
                  <input id={`u${k}`} value={una[k]} onChange={(e) => setUna({ ...una, [k]: e.target.value })} /></div>))}
            </div>
            <div className="acciones"><span />
              <button disabled={ocupado || !una.plan || una.edad === ''} onClick={() => hacer(() => put('tarifas', { filas: [{ plan: una.plan.trim(), ...(una.region ? { region: una.region.trim() } : {}), ...(una.sexo ? { sexo: una.sexo.trim() } : {}), edad: Number(una.edad), prima: una.prima.trim() === '' ? null : Number(una.prima) }] }), 'Tarifa guardada.')}>Guardar tarifa</button></div>
          </div>
          <div className="tarjeta">
            <h2 style={{ marginTop: 0 }}>Cargar muchas tarifas</h2>
            <p className="sub">Pegue desde Excel o CSV. Primera línea: <code>plan,region,sexo,edad,prima</code>. Prima vacía o N/A = sin tarifa. Solo se cambian las filas enviadas.</p>
            <label htmlFor="csv" className="sub">Datos</label>
            <textarea id="csv" rows={8} value={csv} onChange={(e) => setCsv(e.target.value)} style={{ width: '100%', font: '13px monospace', padding: 8 }} />
            <input type="file" accept=".csv,.txt,.tsv" aria-label="Archivo CSV" style={{ marginTop: 8 }} onChange={async (e) => { const a = e.target.files?.[0]; if (a) setCsv(await a.text()); }} />
            <div className="acciones"><span /><button disabled={ocupado || !csv.trim()} onClick={importar}>Importar</button></div>
          </div>
        </>
      )}

      {v.estado === 'BORRADOR' && tieneRol(yo, 'ADMIN_TARIFAS') && (
        <div className="acciones">
          <span className="sub">{soyCreador ? '' : 'Solo quien creó la versión puede enviarla a revisión.'}</span>
          <button className="primario" disabled={ocupado || !soyCreador || !!problemas?.length} onClick={() => hacer(() => post('enviar-revision'), 'Enviada a revisión.')}>Enviar a revisión</button>
        </div>
      )}
      {v.estado === 'EN_REVISION' && tieneRol(yo, 'APROBADOR_TARIFAS') && (
        <div className="tarjeta">
          {soyCreador && <p className="aviso">Usted creó esta versión: la debe aprobar otra persona.</p>}
          {devolviendo ? (
            <>
              <label htmlFor="mo">Motivo de la devolución</label><input id="mo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              <div className="acciones"><button onClick={() => setDevolviendo(false)}>Cancelar</button>
                <button className="peligro" disabled={ocupado || motivo.trim().length < 5} onClick={() => hacer(() => post('devolver', { motivo: motivo.trim() }), 'Devuelta a borrador.')}>Confirmar devolución</button></div>
            </>
          ) : (
            <div className="acciones" style={{ marginTop: 0 }}>
              <button onClick={() => setDevolviendo(true)}>Devolver</button>
              <button className="primario" disabled={ocupado || soyCreador} onClick={() => hacer(() => post('publicar'), 'Versión publicada.')}>Publicar</button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
