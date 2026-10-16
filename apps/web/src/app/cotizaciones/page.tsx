'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import Errores, { mensajesDe } from '@/componentes/Errores';
import Shell from '@/componentes/Shell';
import { api } from '@/lib/api';

interface Fila { id: string; numero: string; titularNombre: string; estado: string; creadaEn: string; validaHasta: string; creadaPor: string }
const POR_PAGINA = 20;

export default function Lista() { return <Shell><Cotizaciones /></Shell>; }

function Cotizaciones() {
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState(''); const [estado, setEstado] = useState('');
  const [pagina, setPagina] = useState(0);
  const [errores, setErrores] = useState<string[]>([]);

  const cargar = useCallback(async () => {
    const p = new URLSearchParams({ limite: String(POR_PAGINA), desplazamiento: String(pagina * POR_PAGINA) });
    if (q.trim()) p.set('q', q.trim());
    if (estado) p.set('estado', estado);
    try { const r = await api<{ total: number; items: Fila[] }>(`/cotizaciones?${p}`); setFilas(r.items); setTotal(r.total); setErrores([]); }
    catch (e) { setErrores(mensajesDe(e)); }
  }, [q, estado, pagina]);
  useEffect(() => { const t = setTimeout(cargar, 250); return () => clearTimeout(t); }, [cargar]);

  return (
    <>
      <h1>Cotizaciones</h1>
      <p className="sub">Busque por nombre del titular o por número.</p>
      <div className="filtros">
        <div><label htmlFor="q">Buscar</label><input id="q" value={q} onChange={(e) => { setQ(e.target.value); setPagina(0); }} /></div>
        <div><label htmlFor="e">Estado</label>
          <select id="e" value={estado} onChange={(e) => { setEstado(e.target.value); setPagina(0); }}>
            <option value="">Todos</option><option value="CALCULADA">Calculada</option><option value="EMITIDA">Emitida</option><option value="ANULADA">Anulada</option></select></div>
      </div>
      <Errores mensajes={errores} />
      <div className="tarjeta tabla-scroll">
        <table>
          <thead><tr><th>Número</th><th>Titular</th><th>Estado</th><th>Creada</th><th>Válida hasta</th><th>Por</th></tr></thead>
          <tbody>
            {filas?.map((c) => (
              <tr key={c.id}>
                <td><Link href={`/cotizaciones/${c.id}`}>{c.numero}</Link></td><td>{c.titularNombre}</td>
                <td><span className={`insignia ${c.estado}`}>{c.estado.charAt(0) + c.estado.slice(1).toLowerCase()}</span></td>
                <td>{new Date(c.creadaEn).toLocaleDateString('es-BO')}</td><td>{c.validaHasta?.slice(0, 10)}</td><td>{c.creadaPor}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filas && filas.length === 0 && <p className="vacio">No hay cotizaciones con esos filtros.</p>}
      </div>
      <div className="acciones">
        <button disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>Anterior</button>
        <span className="sub" style={{ margin: 0 }}>{total} en total</span>
        <button disabled={(pagina + 1) * POR_PAGINA >= total} onClick={() => setPagina(pagina + 1)}>Siguiente</button>
      </div>
    </>
  );
}
