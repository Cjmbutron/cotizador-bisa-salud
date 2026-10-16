import { ETIQUETA_ESTADO, ETIQUETA_PARENTESCO, importe } from '@/lib/formato';
import type { Catalogo, Producto, RespuestaCalculo } from '@/lib/tipos';

interface Persona { parentesco: keyof typeof ETIQUETA_PARENTESCO; edad: number }

/** Muestra totales por producto, primas por asegurado con su paso a paso, y la suma combinada con sus avisos. */
export default function Resultado({ calculo, personas, cat }: { calculo: RespuestaCalculo; personas: Persona[]; cat: Catalogo }) {
  const { resultado, monedas } = calculo;
  const nombre = (p: Producto) => cat.productos.find((x) => x.codigo === p)?.nombre ?? p;
  const productos = [...new Set(resultado.lineas.map((l) => l.producto))];

  return (
    <>
      <p className="sub">Tarifas vigentes: <strong>{calculo.versionTarifa}</strong></p>
      {calculo.advertencias.map((a) => (
        <p className="aviso" key={a} role="note">{a.includes('COMBINADA_MEZCLA_MONEDAS')
          ? 'La suma combinada suma importes en Bs. y en USD sin convertirlos, igual que el Excel actual. Úsela solo como referencia.' : a}</p>
      ))}

      <h2>Totales por producto</h2>
      <div className="totales">
        {resultado.totales.map((t) => (
          <section className="total" key={t.producto} aria-label={nombre(t.producto)}>
            <h3>{nombre(t.producto)}</h3>
            <dl>
              <dt>Mensual</dt><dd className="grande">{importe(t.mensual, monedas[t.producto])}</dd>
              <dt>Anual</dt><dd>{importe(t.anual, monedas[t.producto])}</dd>
              <dt>Al contado</dt><dd>{importe(t.contado, monedas[t.producto])}</dd>
            </dl>
          </section>
        ))}
        {resultado.combinada && (
          <section className="total" aria-label="Suma combinada">
            <h3>Suma combinada</h3>
            <dl>
              <dt>Mensual</dt><dd className="grande">{importe(resultado.combinada.mensual)}</dd>
              <dt>Anual</dt><dd>{importe(resultado.combinada.anual)}</dd>
              <dt>Al contado</dt><dd>{importe(resultado.combinada.contado)}</dd>
            </dl>
          </section>
        )}
      </div>

      <h2>Prima mensual por asegurado</h2>
      <div className="tabla-scroll">
        <table>
          <thead>
            <tr><th>Asegurado</th>{productos.map((p) => <th key={p} className="num">{nombre(p)}</th>)}</tr>
          </thead>
          <tbody>
            {personas.map((per, i) => (
              <tr key={i}>
                <td>{ETIQUETA_PARENTESCO[per.parentesco]} · {per.edad} años</td>
                {productos.map((p) => {
                  const l = resultado.lineas.find((x) => x.aseguradoIdx === i && x.producto === p);
                  if (!l) return <td key={p} />;
                  return (
                    <td key={p} className="num">
                      {l.estado === 'OK' ? importe(l.primaMensual, monedas[p]) : <span className={`insignia ${l.estado}`}>{ETIQUETA_ESTADO[l.estado]}</span>}
                      {l.motivo && <div style={{ fontSize: 12, color: 'var(--suave)' }}>{l.motivo}</div>}
                      <details>
                        <summary>Cálculo</summary>
                        <ol>{l.detalle.map((d, k) => <li key={k}>{d.paso}{d.valor !== undefined ? `: ${d.valor}` : ''}</li>)}</ol>
                      </details>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
