'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Errores, { mensajesDe } from '@/componentes/Errores';
import Resultado from '@/componentes/Resultado';
import Shell from '@/componentes/Shell';
import { api } from '@/lib/api';
import { aEntrada, aseguradoNuevo, formInicial, opciones, problemasDeForma } from '@/lib/entrada';
import { ETIQUETA_PARENTESCO, ETIQUETA_SEXO } from '@/lib/formato';
import type { Catalogo, FormCotizacion, Parentesco, Producto, RespuestaCalculo } from '@/lib/tipos';

const PASOS = ['Titular', 'Productos', 'Asegurados', 'Configuración', 'Resultado', 'Guardar'];

export default function Cotizar() {
  return <Shell><Asistente /></Shell>;
}

function Asistente() {
  const [cat, setCat] = useState<Catalogo | null>(null);
  const [f, setF] = useState<FormCotizacion | null>(null);
  const [paso, setPaso] = useState(1);
  const [errores, setErrores] = useState<string[]>([]);
  const [calculo, setCalculo] = useState<RespuestaCalculo | null>(null);
  const [guardada, setGuardada] = useState<RespuestaCalculo | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    api<Catalogo>('/catalogo').then((c) => { setCat(c); setF(formInicial(c)); }).catch((e) => setErrores(mensajesDe(e)));
  }, []);

  if (!cat || !f) return <><Errores mensajes={errores} />{!errores.length && <p className="sub">Cargando…</p>}</>;
  const op = opciones(cat);
  const cambiar = (parcial: Partial<FormCotizacion>) => { setF({ ...f, ...parcial }); setCalculo(null); setGuardada(null); };
  const dependientesMenores = f.asegurados.filter((a) => a.parentesco === 'DEPENDIENTE' && Number(a.edad) < 25).length;

  async function calcular() {
    setOcupado(true); setErrores([]);
    try { setCalculo(await api<RespuestaCalculo>('/cotizaciones/calcular', { cuerpo: aEntrada(f!) })); return true; }
    catch (e) { setErrores(mensajesDe(e)); setCalculo(null); return false; }
    finally { setOcupado(false); }
  }

  async function siguiente() {
    const p = problemasDeForma(f!, paso);
    if (p.length) { setErrores(p); return; }
    setErrores([]);
    if (paso === 4 && f!.productos.includes('MB') && f!.mbNumeroHijos === '' && dependientesMenores > 0) {
      setErrores(['Indique el número de hijos para Mundial Blue.']); return;
    }
    if (paso === 4) { await calcular(); setPaso(5); return; }
    setPaso(paso + 1);
  }

  async function guardar() {
    setOcupado(true); setErrores([]);
    try { setGuardada(await api<RespuestaCalculo>('/cotizaciones', { cuerpo: { titularNombre: f!.titularNombre.trim(), entrada: aEntrada(f!) } })); }
    catch (e) { setErrores(mensajesDe(e)); }
    finally { setOcupado(false); }
  }

  const nuevoAseg = (parentesco: Parentesco) => cambiar({ asegurados: [...f.asegurados, aseguradoNuevo(parentesco)] });
  const hay = (p: Parentesco) => f.asegurados.filter((a) => a.parentesco === p).length;
  const max = (p: Parentesco) => cat.parentescos.find((x) => x.codigo === p)?.maximo ?? 0;

  return (
    <>
      <h1>Nueva cotización</h1>
      <p className="sub">Complete los pasos; el cálculo se hace con las tarifas vigentes.</p>
      <ol className="pasos" aria-label="Pasos">
        {PASOS.map((n, i) => <li key={n} className={i + 1 === paso ? 'actual' : i + 1 < paso ? 'hecho' : ''} aria-current={i + 1 === paso ? 'step' : undefined}>{i + 1}. {n}</li>)}
      </ol>

      <div className="tarjeta">
        {paso === 1 && (
          <div className="rejilla">
            <div><label htmlFor="nombre">Nombre del titular</label>
              <input id="nombre" value={f.titularNombre} maxLength={120} onChange={(e) => cambiar({ titularNombre: e.target.value })} /></div>
            <div><label htmlFor="regional">Regional</label>
              <select id="regional" value={f.regional} onChange={(e) => cambiar({ regional: e.target.value })}>
                {cat.regiones.map((r) => <option key={r.codigo} value={r.codigo}>{r.nombre}</option>)}</select></div>
            <div><label htmlFor="sars">Cobertura SARS COVID-19</label>
              <select id="sars" value={f.aplicaSars ? 'SI' : 'NO'} onChange={(e) => cambiar({ aplicaSars: e.target.value === 'SI' })}>
                <option value="NO">No aplica</option><option value="SI">Aplica</option></select></div>
          </div>
        )}

        {paso === 2 && (
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="sub">Seleccione los productos a cotizar</legend>
            <div className="marcas">
              {cat.productos.map((p) => {
                const activo = f.productos.includes(p.codigo);
                return (
                  <label key={p.codigo} className={`marca ${activo ? 'activa' : ''}`}>
                    <input type="checkbox" checked={activo}
                      onChange={() => cambiar({ productos: activo ? f.productos.filter((x) => x !== p.codigo) : [...f.productos, p.codigo] })} />
                    {p.nombre} <span style={{ color: 'var(--suave)' }}>({p.moneda === 'USD' ? 'USD' : 'Bs.'})</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        {paso === 3 && (
          <>
            {f.asegurados.map((a, i) => {
              const permiteMat = cat.parentescos.find((x) => x.codigo === a.parentesco)?.permiteMaternidad;
              return (
                <div className="fila-aseg" key={i}>
                  <div><label>Parentesco</label><div style={{ padding: '8px 0' }}>{ETIQUETA_PARENTESCO[a.parentesco]}</div></div>
                  <div><label htmlFor={`edad${i}`}>Edad</label>
                    <input id={`edad${i}`} inputMode="numeric" value={a.edad} onChange={(e) => cambiar({ asegurados: f.asegurados.map((x, k) => k === i ? { ...x, edad: e.target.value.trim() } : x) })} /></div>
                  <div><label htmlFor={`sexo${i}`}>Sexo</label>
                    <select id={`sexo${i}`} value={a.sexo} onChange={(e) => cambiar({ asegurados: f.asegurados.map((x, k) => k === i ? { ...x, sexo: e.target.value as typeof a.sexo } : x) })}>
                      {(Object.keys(ETIQUETA_SEXO) as (keyof typeof ETIQUETA_SEXO)[]).filter((s) => s !== 'FEMENINO_CON_MATERNIDAD' || permiteMat)
                        .map((s) => <option key={s} value={s}>{ETIQUETA_SEXO[s]}</option>)}</select></div>
                  {f.productos.length > 1 && (
                    <div><label htmlFor={`pe${i}`}>Producto elegido (suma combinada)</label>
                      <select id={`pe${i}`} value={a.productoElegido ?? ''} onChange={(e) => cambiar({ asegurados: f.asegurados.map((x, k) => k === i ? { ...x, productoElegido: (e.target.value || undefined) as Producto | undefined } : x) })}>
                        <option value="">— ninguno —</option>{f.productos.map((p) => <option key={p} value={p}>{cat.productos.find((x) => x.codigo === p)?.nombre}</option>)}</select></div>
                  )}
                  {a.parentesco !== 'TITULAR' && <button className="peligro" onClick={() => cambiar({ asegurados: f.asegurados.filter((_, k) => k !== i) })} aria-label={`Quitar asegurado ${i + 1}`}>Quitar</button>}
                </div>
              );
            })}
            <div className="acciones" style={{ justifyContent: 'flex-start' }}>
              <button disabled={hay('CONYUGE') >= max('CONYUGE')} onClick={() => nuevoAseg('CONYUGE')}>+ Cónyuge</button>
              <button disabled={hay('DEPENDIENTE') >= max('DEPENDIENTE')} onClick={() => nuevoAseg('DEPENDIENTE')}>+ Dependiente</button>
              <span className="sub" style={{ margin: 0, alignSelf: 'center' }}>Máximo {f.asegurados.length}/{max('TITULAR') + max('CONYUGE') + max('DEPENDIENTE')} asegurados</span>
            </div>
          </>
        )}

        {paso === 4 && (
          <div className="rejilla">
            {f.productos.length === 0 || !f.productos.some((p) => ['RM', 'MB', 'NP'].includes(p)) ? (
              <p className="sub">Los productos elegidos no requieren configuración adicional.</p>
            ) : null}
            {f.productos.includes('RM') && (
              <div><label htmlFor="rm">Red Max: plan</label>
                <select id="rm" value={f.redMaxPlan} onChange={(e) => cambiar({ redMaxPlan: e.target.value })}>
                  {op.redMax.map((p) => <option key={p.codigo} value={p.codigo}>{p.nombre}</option>)}</select></div>
            )}
            {f.productos.includes('MB') && (<>
              <div><label htmlFor="mbc">Mundial Blue: cobertura</label>
                <select id="mbc" value={f.mbCobertura} onChange={(e) => cambiar({ mbCobertura: e.target.value })}>{op.mbCoberturas.map((c) => <option key={c}>{c}</option>)}</select></div>
              <div><label htmlFor="mbd">Mundial Blue: deducible</label>
                <select id="mbd" value={f.mbDeducible} onChange={(e) => cambiar({ mbDeducible: e.target.value })}>{op.mbDeducibles.map((c) => <option key={c}>{c}</option>)}</select></div>
              <div><label htmlFor="mbh">Mundial Blue: número de hijos (1 a 5)</label>
                <input id="mbh" inputMode="numeric" value={f.mbNumeroHijos} placeholder={dependientesMenores ? String(dependientesMenores) : ''}
                  onChange={(e) => cambiar({ mbNumeroHijos: e.target.value.trim() })} />
                {dependientesMenores > 0 && f.mbNumeroHijos === '' && <button style={{ marginTop: 6 }} onClick={() => cambiar({ mbNumeroHijos: String(dependientesMenores) })}>Usar {dependientesMenores} (dependientes menores de 25)</button>}</div>
            </>)}
            {f.productos.includes('NP') && (<>
              <div><label htmlFor="npa">Naranja+: ámbito</label>
                <select id="npa" value={f.npAmbito} onChange={(e) => { const a = e.target.value; cambiar({ npAmbito: a, npValor: op.npValores(a)[0] ?? '', npDeducible: op.npDeducibles(a)[0] ?? '' }); }}>
                  {op.npAmbitos.map((a) => <option key={a} value={a}>{a === 'BOLIVIA' ? 'Bolivia' : 'Mundial con Bolivia'}</option>)}</select></div>
              <div><label htmlFor="npv">Naranja+: valor asegurado</label>
                <select id="npv" value={f.npValor} onChange={(e) => cambiar({ npValor: e.target.value })}>{op.npValores(f.npAmbito).map((v) => <option key={v}>{v}</option>)}</select></div>
              <div><label htmlFor="npd">Naranja+: deducible</label>
                <select id="npd" value={f.npDeducible} onChange={(e) => cambiar({ npDeducible: e.target.value })}>{op.npDeducibles(f.npAmbito).map((v) => <option key={v}>{v}</option>)}</select></div>
            </>)}
          </div>
        )}

        {paso === 5 && (calculo
          ? <Resultado calculo={calculo} cat={cat} personas={f.asegurados.map((a) => ({ parentesco: a.parentesco, edad: Number(a.edad) }))} />
          : <p className="sub">{ocupado ? 'Calculando…' : 'No se pudo calcular. Corrija los datos indicados y vuelva a intentar.'}</p>)}

        {paso === 6 && (
          guardada ? (
            <div className="exito" role="status">
              <strong>Cotización {guardada.numero} guardada.</strong> Válida hasta el {guardada.validaHasta}.
              <div style={{ marginTop: 8 }}><Link href={`/cotizaciones/${guardada.id}`}>Ver cotización y emitirla</Link> · <Link href="/cotizar" onClick={() => location.reload()}>Nueva cotización</Link></div>
            </div>
          ) : (
            <>
              <p>Se guardará la cotización de <strong>{f.titularNombre}</strong> con las tarifas vigentes de hoy. Podrá emitirla desde su detalle mientras esté vigente.</p>
              <button className="primario" disabled={ocupado} onClick={guardar}>{ocupado ? 'Guardando…' : 'Guardar cotización'}</button>
            </>
          )
        )}

        <Errores mensajes={errores} />

        <div className="acciones">
          <button disabled={paso === 1 || ocupado || !!guardada} onClick={() => { setErrores([]); setPaso(paso - 1); }}>Atrás</button>
          {paso < 5 && <button className="primario" disabled={ocupado} onClick={siguiente}>{paso === 4 ? 'Calcular' : 'Siguiente'}</button>}
          {paso === 5 && <><button disabled={ocupado} onClick={calcular}>Recalcular</button><button className="primario" disabled={!calculo || ocupado} onClick={() => setPaso(6)}>Continuar</button></>}
        </div>
      </div>
    </>
  );
}
