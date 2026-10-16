// Genera los 13 PDF con los datos con que quedó guardado el Excel, para compararlos con el original.
// Uso: CHROMIUM_PATH=... CHROMIUM_SIN_SANDBOX=true node scripts/muestras.cjs <carpeta_salida> [hojas separadas por coma]
const fs = require('fs');
const path = require('path');
const { cargarPlantilla } = require('../dist/documentos/plantilla');
const { cotizadorVirtual } = require('../dist/documentos/contexto');
const { renderizarHtml } = require('../dist/documentos/render');
const { PdfService } = require('../dist/documentos/pdf.service');

const salida = process.argv[2];
const solo = (process.argv[3] || '').split(',').filter(Boolean);
fs.mkdirSync(salida, { recursive: true });
const EXCEL = {
  numero: 'COT-2026-000001', titularNombre: 'Jorge Vargas',
  entrada: { regional: 'LPZ', aplicaSars: false, productos: ['IG', 'RM', 'AD', 'MB', 'NP'], asegurados: [], redMax: { plan: 'RM_700K' },
    mundialBlue: { cobertura: '1MM', deducible: '5K', numeroHijos: 1 }, naranjaPlus: { ambito: 'MUNDIAL_CON_BOLIVIA', valorAsegurado: '1MM', deducible: '10K' } },
  asegurados: [{ orden: 1, parentesco: 'TITULAR', edad: 11, sexo: 'FEMENINO_SIN_MATERNIDAD' }],
  lineas: [['IG', '68'], ['RM', '427'], ['AD', '231'], ['MB', '44'], ['NP', '28']].map(([producto, p]) => ({ aseguradoOrden: 1, producto, estado: 'OK', primaMensual: p })),
  totales: [['IG', '68', '816', '795.6'], ['RM', '427', '5124', '4995.9'], ['AD', '231', '2772', '2702.7'], ['MB', '44', '528', '479.952'], ['NP', '28', '336', '305.45454545454544']]
    .map(([producto, mensual, anual, contado]) => ({ producto, mensual, anual, contado })),
};
(async () => {
  const pdf = new PdfService({ CHROMIUM_PATH: process.env.CHROMIUM_PATH, CHROMIUM_SIN_SANDBOX: process.env.CHROMIUM_SIN_SANDBOX === 'true' });
  const claves = fs.readdirSync(path.join(__dirname, '..', 'plantillas')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
  for (const clave of claves) {
    if (solo.length && !solo.includes(clave)) continue;
    const p = cargarPlantilla(clave);
    const { html, anchoPx } = renderizarHtml(p, cotizadorVirtual(EXCEL, clave.split('_')[0]), { hoy: new Date(), marcaAgua: 'TEXTO PROVISIONAL\nPENDIENTE DE REVISIÓN COMERCIAL' });
    fs.writeFileSync(path.join(salida, clave + '.html'), html);
    const buf = await pdf.generar(html, anchoPx, 'COT-2026-000001 · muestra');
    fs.writeFileSync(path.join(salida, clave + '.pdf'), buf);
    console.log(clave, buf.length);
  }
  await pdf.onModuleDestroy();
})().catch((e) => { console.error(e); process.exit(1); });
