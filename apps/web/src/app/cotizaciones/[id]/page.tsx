'use client';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import Errores, { mensajesDe } from '@/componentes/Errores';
import Resultado from '@/componentes/Resultado';
import Shell from '@/componentes/Shell';
import { api, descargarPdf } from '@/lib/api';
import { useYo } from '@/lib/yo';
import type { Catalogo, Producto, RespuestaCalculo } from '@/lib/tipos';

interface Detalle {
  id: string; numero: string; titularNombre: string; estado: 'CALCULADA' | 'EMITIDA' | 'ANULADA'; creadaEn: string; validaHasta: string;
  versionTarifa: string; creadaPor: string; entrada: { productos: Producto[] };
  asegurados: { orden: number; parentesco: 'TITULAR' | 'CONYUGE' | 'DEPENDIENTE'; edad: number }[];
  lineas: any[]; totales: any[]; combinada: any | null;
}

export default function Pagina() { return <Shell><Cotizacion /></Shell>; }

function Cotizacion() {
  const { id } = useParams<{ id: string }>();
  const yo = useYo();
  const [d, setD] = useState<Detalle | null>(null);
  const [cat, setCat] = useState<Catalogo | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const [aviso, setAviso] = useState('');
  const [motivo, setMotivo] = useState(''); const [anulando, setAnulando] = useState(false); const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try { setD(await api<Detalle>(`/cotizaciones/${id}`)); setCat(await api<Catalogo>('/catalogo')); }
    catch (e) { setErrores(mensajesDe(e)); }
  }, [id]);
  useEffect(() => { cargar(); }, [cargar]);

  async function accion(ruta: string, cuerpo?: unknown) {
    setOcupado(true); setErrores([]);
    try { await api(`/cotizaciones/${id}/${ruta}`, { metodo: 'POST', cuerpo: cuerpo ?? {} }); setAnulando(false); await cargar(); }
    catch (e) { setErrores(mensajesDe(e)); } finally { setOcupado(false); }
  }

  async function bajar(codigo: string) {
    setOcupado(true); setErrores([]); setAviso('');
    try {
      const r = await descargarPdf(`/cotizaciones/${id}/documentos/${codigo}`);
      setAviso(r.provisional ? `Descargado «${r.archivo}». El texto de esta plantilla aún no fue aprobado por el área comercial: el PDF lleva la marca «TEXTO PROVISIONAL» y no debe enviarse al cliente.` : `Descargado «${r.archivo}».`);
    } catch (e) { setErrores(mensajesDe(e)); } finally { setOcupado(false); }
  }

  if (!d || !cat) return <Errores mensajes={errores.length ? errores : []} />;
  const calculo: RespuestaCalculo = {
    versionTarifa: d.versionTarifa, advertencias: [],
    monedas: Object.fromEntries(cat.productos.map((p) => [p.codigo, p.moneda])),
    resultado: {
      lineas: d.lineas.map((l) => ({ ...l, aseguradoIdx: l.aseguradoOrden - 1 })),
      totales: d.totales, ...(d.combinada ? { combinada: d.combinada } : {}),
    },
  };
  const mia = d.creadaPor === yo.email;

  return (
    <>
      <h1>{d.numero} <span className={`insignia ${d.estado}`}>{d.estado.charAt(0) + d.estado.slice(1).toLowerCase()}</span></h1>
      <p className="sub">Titular: <strong>{d.titularNombre}</strong> · creada por {d.creadaPor} el {new Date(d.creadaEn).toLocaleDateString('es-BO')} · válida hasta {d.validaHasta}</p>
      <Errores mensajes={errores} />
      <div className="tarjeta"><Resultado calculo={calculo} cat={cat} personas={d.asegurados.map((a) => ({ parentesco: a.parentesco, edad: a.edad }))} /></div>
      {d.estado !== 'ANULADA' && (
        <div className="tarjeta">
          <h2>Propuesta en PDF</h2>
          <div className="acciones" style={{ marginTop: 0 }}>
            {d.entrada.productos.map((cod) => (
              <button key={cod} disabled={ocupado} onClick={() => bajar(cod)}>
                Descargar {cat.productos.find((p) => p.codigo === cod)?.nombre ?? cod}
              </button>
            ))}
          </div>
          {aviso && <p className="sub" role="status">{aviso}</p>}
        </div>
      )}
      {d.estado !== 'ANULADA' && (
        <div className="tarjeta">
          {anulando ? (
            <>
              <label htmlFor="motivo">Motivo de la anulación (obligatorio)</label>
              <input id="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              <div className="acciones"><button onClick={() => setAnulando(false)}>Cancelar</button>
                <button className="peligro" disabled={motivo.trim().length < 5 || ocupado} onClick={() => accion('anular', { motivo: motivo.trim() })}>Confirmar anulación</button></div>
            </>
          ) : (
            <div className="acciones" style={{ marginTop: 0 }}>
              <button className="peligro" onClick={() => setAnulando(true)}>Anular</button>
              {d.estado === 'CALCULADA' && mia && <button className="primario" disabled={ocupado} onClick={() => accion('emitir')}>Emitir cotización</button>}
            </div>
          )}
        </div>
      )}
    </>
  );
}
