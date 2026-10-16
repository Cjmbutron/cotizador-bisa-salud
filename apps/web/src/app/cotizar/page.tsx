'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import Errores, { mensajesDe } from '@/componentes/Errores';
import Resultado from '@/componentes/Resultado';
import Shell from '@/componentes/Shell';
import { api } from '@/lib/api';
import { aEntrada, aseguradoNuevo, faltantesParaCalcular, formInicial, opciones } from '@/lib/entrada';
import { ETIQUETA_PARENTESCO, ETIQUETA_SEXO, importe } from '@/lib/formato';
import type { Catalogo, FormCotizacion, Parentesco, Producto, RespuestaCalculo } from '@/lib/tipos';

/** Espera tras la última edición antes de calcular, para no llamar a la API en cada tecla. */
const ESPERA_MS = 400;

export default function Cotizar() {
  return <Shell ancho><Pantalla /></Shell>;
}

function Pantalla() {
  const [cat, setCat] = useState<Catalogo | null>(null);
  const [f, setF] = useState<FormCotizacion | null>(null);
  // Mientras el usuario no escriba el número de hijos de Mundial Blue, se toma de los dependientes menores de 25.
  const [hijosManual, setHijosManual] = useState(false);
  const [calculo, setCalculo] = useState<{ clave: string; datos: RespuestaCalculo } | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [erroresCalculo, setErroresCalculo] = useState<string[]>([]);
  const [erroresGuardar, setErroresGuardar] = useState<string[]>([]);
  const [guardada, setGuardada] = useState<RespuestaCalculo | null>(null);
  const [guardando, setGuardando] = useState(false);
  const secuencia = useRef(0);

  useEffect(() => {
    api<Catalogo>('/catalogo').then((c) => { setCat(c); setF(formInicial(c)); }).catch((e) => setErroresCalculo(mensajesDe(e)));
  }, []);

  const menores = f ? f.asegurados.filter((a) => a.parentesco === 'DEPENDIENTE' && a.edad !== '' && Number(a.edad) < 25).length : 0;
  const fe: FormCotizacion | null = f && { ...f, mbNumeroHijos: hijosManual ? f.mbNumeroHijos : menores > 0 ? String(menores) : '' };
  const faltan = fe ? faltantesParaCalcular(fe) : [];
  const clave = fe && faltan.length === 0 ? JSON.stringify(aEntrada(fe)) : null;

  // Cálculo en vivo: cada cambio válido recalcula; una respuesta que llega tarde (de una edición anterior) se descarta.
  useEffect(() => {
    const mi = ++secuencia.current;
    if (!clave) { setCalculo(null); setErroresCalculo([]); setCalculando(false); return; }
    setCalculando(true);
    const espera = setTimeout(async () => {
      try {
        const datos = await api<RespuestaCalculo>('/cotizaciones/calcular', { cuerpo: JSON.parse(clave) });
        if (mi === secuencia.current) { setCalculo({ clave, datos }); setErroresCalculo([]); }
      } catch (e) {
        if (mi === secuencia.current) { setCalculo(null); setErroresCalculo(mensajesDe(e)); }
      } finally {
        if (mi === secuencia.current) setCalculando(false);
      }
    }, ESPERA_MS);
    return () => clearTimeout(espera);
  }, [clave]);

  useEffect(() => { if (guardada) document.getElementById('guardado')?.scrollIntoView({ block: 'center' }); }, [guardada]);

  if (!cat || !f || !fe) return <><Errores mensajes={erroresCalculo} />{!erroresCalculo.length && <p className="sub">Cargando…</p>}</>;
  const op = opciones(cat);
  const cambiar = (parcial: Partial<FormCotizacion>) => { setF({ ...f, ...parcial }); setGuardada(null); setErroresGuardar([]); };
  const form = fe; // fe ya no es nulo aquí; se fija para usarlo dentro de funciones
  const vigente = calculo && calculo.clave === clave ? calculo.datos : null;
  const nombreProducto = (p: Producto) => cat.productos.find((x) => x.codigo === p)?.nombre ?? p;

  async function guardar() {
    if (!form.titularNombre.trim()) { setErroresGuardar(['Escriba el nombre del titular para guardar la cotización.']); document.getElementById('nombre')?.focus(); return; }
    if (!clave || !vigente) return;
    setGuardando(true); setErroresGuardar([]);
    try { setGuardada(await api<RespuestaCalculo>('/cotizaciones', { cuerpo: { titularNombre: form.titularNombre.trim(), entrada: JSON.parse(clave) } })); }
    catch (e) { setErroresGuardar(mensajesDe(e)); }
    finally { setGuardando(false); }
  }

  const nuevoAseg = (parentesco: Parentesco) => cambiar({ asegurados: [...f.asegurados, aseguradoNuevo(parentesco)] });
  const hay = (p: Parentesco) => f.asegurados.filter((a) => a.parentesco === p).length;
  const max = (p: Parentesco) => cat.parentescos.find((x) => x.codigo === p)?.maximo ?? 0;
  const puedeGuardar = !!vigente && !calculando && !guardando && !guardada;

  function opcionesDe(p: Producto) {
    if (p === 'RM') return (
      <div className="rejilla">
        <div><label htmlFor="rm">Plan</label>
          <select id="rm" value={f!.redMaxPlan} onChange={(e) => cambiar({ redMaxPlan: e.target.value })}>
            {op.redMax.map((x) => <option key={x.codigo} value={x.codigo}>{x.nombre}</option>)}</select></div>
      </div>
    );
    if (p === 'MB') return (
      <div className="rejilla">
        <div><label htmlFor="mbc">Cobertura</label>
          <select id="mbc" value={f!.mbCobertura} onChange={(e) => cambiar({ mbCobertura: e.target.value })}>{op.mbCoberturas.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div><label htmlFor="mbd">Deducible</label>
          <select id="mbd" value={f!.mbDeducible} onChange={(e) => cambiar({ mbDeducible: e.target.value })}>{op.mbDeducibles.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div><label htmlFor="mbh">Número de hijos (1 a 5)</label>
          <input id="mbh" inputMode="numeric" value={fe!.mbNumeroHijos}
            onChange={(e) => { const v = e.target.value.trim(); setHijosManual(v !== ''); cambiar({ mbNumeroHijos: v }); }} />
          <span className="ayuda">{hijosManual ? 'Valor escrito por usted. Déjelo vacío para usar los dependientes menores de 25.' : menores > 0 ? 'Calculado con los dependientes menores de 25.' : 'Sin dependientes menores de 25.'}</span></div>
      </div>
    );
    if (p === 'NP') return (
      <div className="rejilla">
        <div><label htmlFor="npa">Ámbito</label>
          <select id="npa" value={f!.npAmbito} onChange={(e) => { const a = e.target.value; cambiar({ npAmbito: a, npValor: op.npValores(a)[0] ?? '', npDeducible: op.npDeducibles(a)[0] ?? '' }); }}>
            {op.npAmbitos.map((a) => <option key={a} value={a}>{a === 'BOLIVIA' ? 'Bolivia' : 'Mundial con Bolivia'}</option>)}</select></div>
        <div><label htmlFor="npv">Valor asegurado</label>
          <select id="npv" value={f!.npValor} onChange={(e) => cambiar({ npValor: e.target.value })}>{op.npValores(f!.npAmbito).map((v) => <option key={v}>{v}</option>)}</select></div>
        <div><label htmlFor="npd">Deducible</label>
          <select id="npd" value={f!.npDeducible} onChange={(e) => cambiar({ npDeducible: e.target.value })}>{op.npDeducibles(f!.npAmbito).map((v) => <option key={v}>{v}</option>)}</select></div>
      </div>
    );
    return null;
  }

  return (
    <>
      <h1>Nueva cotización</h1>
      <p className="sub">Complete los datos: el resultado se actualiza solo con las tarifas vigentes.</p>

      <div className="cotizar">
        <div className="cotizar-form">
          <section className="tarjeta" aria-labelledby="h-titular">
            <h2 id="h-titular">Titular</h2>
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
          </section>

          <section className="tarjeta" aria-labelledby="h-productos">
            <h2 id="h-productos">Productos</h2>
            <div className="productos">
              {cat.productos.map((p) => {
                const activo = f.productos.includes(p.codigo);
                return (
                  <div key={p.codigo} className={`producto ${activo ? 'activo' : ''}`}>
                    <label className={`marca ${activo ? 'activa' : ''}`}>
                      <input type="checkbox" checked={activo}
                        onChange={() => cambiar({ productos: activo ? f.productos.filter((x) => x !== p.codigo) : [...f.productos, p.codigo] })} />
                      {p.nombre} <span style={{ color: 'var(--suave)' }}>({p.moneda === 'USD' ? 'USD' : 'Bs.'})</span>
                    </label>
                    {activo && ['RM', 'MB', 'NP'].includes(p.codigo) && <div className="opciones-producto" role="group" aria-label={`Opciones de ${p.nombre}`}>{opcionesDe(p.codigo)}</div>}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="tarjeta" aria-labelledby="h-aseg">
            <h2 id="h-aseg">Asegurados</h2>
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
                        <option value="">— ninguno —</option>{f.productos.map((p) => <option key={p} value={p}>{nombreProducto(p)}</option>)}</select></div>
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
          </section>

          <section className="tarjeta" aria-labelledby="h-guardar">
            <h2 id="h-guardar">Guardar</h2>
            {guardada ? (
              <div className="exito" role="status" id="guardado">
                <strong>Cotización {guardada.numero} guardada.</strong> Válida hasta el {guardada.validaHasta}.
                <div style={{ marginTop: 8 }}><Link href={`/cotizaciones/${guardada.id}`}>Ver cotización y emitirla</Link> · <Link href="/cotizar" onClick={() => location.reload()}>Nueva cotización</Link></div>
              </div>
            ) : (
              <>
                <p className="sub" style={{ marginBottom: 12 }}>Se guarda con las tarifas vigentes de hoy. Podrá emitirla desde su detalle mientras esté vigente.</p>
                <Errores mensajes={erroresGuardar} />
                <button className="primario" disabled={!puedeGuardar} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar cotización'}</button>
              </>
            )}
          </section>
        </div>

        <aside className="cotizar-resultado" id="resultado" aria-label="Resultado del cálculo" aria-live="polite">
          <div className={`tarjeta ${calculando && vigente ? 'actualizando' : ''}`}>
            {faltan.length > 0 && (
              <>
                <h2 style={{ marginTop: 0 }}>Resultado</h2>
                <p className="sub">Complete los datos para ver el cálculo:</p>
                <ul className="faltan">{faltan.map((m) => <li key={m}>{m}</li>)}</ul>
              </>
            )}
            {faltan.length === 0 && <Errores mensajes={erroresCalculo} />}
            {faltan.length === 0 && !vigente && !erroresCalculo.length && <p className="sub" style={{ margin: 0 }}>Calculando…</p>}
            {faltan.length === 0 && vigente && (
              <Resultado calculo={vigente} cat={cat} personas={fe.asegurados.map((a) => ({ parentesco: a.parentesco, edad: Number(a.edad) }))} />
            )}
          </div>
        </aside>
      </div>

      {vigente && (
        <aside className="barra-total" aria-label="Resumen de totales">
          <div className="barra-total-importes">
            {vigente.resultado.totales.map((t) => (
              <span key={t.producto}><small>{nombreProducto(t.producto)}</small> <strong>{importe(t.mensual, vigente.monedas[t.producto])}</strong></span>
            ))}
            {vigente.resultado.combinada && <span><small>Combinada</small> <strong>{importe(vigente.resultado.combinada.mensual)}</strong></span>}
          </div>
          <a href="#resultado">Detalle</a>
          <button className="primario" disabled={!puedeGuardar} onClick={guardar}>Guardar</button>
        </aside>
      )}
    </>
  );
}
