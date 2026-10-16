#!/usr/bin/env python3
"""
Genera los datos de prueba del motor a partir del Excel original:
  fixtures/tarifas.json  paquete de tarifas (formato PaqueteTarifas)
  fixtures/golden.json   casos con el resultado del Excel y el esperado del sistema

Uso:  BISA_XLSM=/ruta/COTIZADOR_BISA_SALUD.xlsm python3 scripts/generar_fixtures.py
"""
import json, os, sys
from decimal import Decimal, ROUND_CEILING
sys.path.insert(0, os.path.dirname(__file__))
import referencia_engine as R   # motor de referencia en Python, validado contra el Excel (610/635 idénticos, 25 diferencias intencionales)

AQUI = os.path.dirname(os.path.dirname(__file__))
FIX = os.path.join(AQUI, 'fixtures')

# ------------------------------------------------------------ tarifas.json
def col(vals, n): return [v if isinstance(v, (int, float)) else None for v in vals] + [None] * (n - len(vals))
CODIGO = {'LA PAZ': 'LPZ', 'COCHABAMBA': 'CBBA', 'SANTA CRUZ': 'SCZ', 'CHUQUISACA': 'CHQ', 'TARIJA': 'TJA'}
igr = {}
for nombre, c in R.REG.items():
    reg = CODIGO[nombre]
    igr[reg] = {}
    for prod, off in (('IG', 0), ('RM', 3), ('AD', 6)):
        igr[reg][prod] = {}
        for k, sx in enumerate(['M', 'F-M', 'F']):
            igr[reg][prod][sx] = [R.num(R.IGR.cell(4 + e, R.ci(c) + off + k).value) for e in range(100)]
mb_adulto, mb_hijo = {}, {}
for cov in R.COV:
    for ded in R.DED:
        k = f'{cov}_{ded}'
        mb_adulto[k] = [None] * 18 + [R.rate_mb_adult(cov, ded, e) for e in range(18, 100)]
        mb_hijo[k] = [None] + [R.rate_mb_child(cov, ded, n) for n in range(1, 6)]
CAT = {'BOLIVIA': ('L', ['50K', '100K', '250K'], ['5K', '10K']),
       'MUNDIAL_CON_BOLIVIA': ('MB', ['150K', '250K', '500K', '1MM'], ['5K', '10K', '50K', '100K'])}
np_ = {}
for amb, (cod, vas, deds) in CAT.items():
    for va in vas:
        for ded in deds:
            np_[f'{cod}_{va}_{ded}'] = [R.rate_np(cod, va, ded, e) for e in range(85)]
tarifas = {'igr': igr, 'mbAdulto': mb_adulto, 'mbHijo': mb_hijo, 'np': np_,
           'catalogoNP': {a: {'codigo': c, 'valoresAsegurados': v, 'deducibles': d} for a, (c, v, d) in CAT.items()}}
json.dump(tarifas, open(os.path.join(FIX, 'tarifas.json'), 'w'))

# ------------------------------------------------------------ golden.json
esc = json.load(open(os.path.join(FIX, 'excel_escenarios.json')))
REGION = {'LA PAZ': 'LPZ', 'COCHABAMBA': 'CBBA', 'SANTA CRUZ': 'SCZ', 'CHUQUISACA': 'CHQ', 'TARIJA': 'TJA'}
SEXO = {'MASCULINO': 'MASCULINO', 'FEMENINO SIN MATERNIDAD': 'FEMENINO_SIN_MATERNIDAD', 'FEMENINO CON MATERNIDAD': 'FEMENINO_CON_MATERNIDAD'}
COV = {'USD 1.000.000.-': '1MM', 'USD 2.000.000.-': '2MM', 'USD 5.000.000.-': '5MM'}
DED = {'USD 1.000.-': '1K', 'USD 2.000.-': '2K', 'USD 3.000.-': '3K', 'USD 5.000.-': '5K', 'USD 10.000.-': '10K', 'USD 20.000.-': '20K'}
NPVA = {'USD 50.000.-': '50K', 'USD 100.000.-': '100K', 'USD 150.000.-': '150K', 'USD 250.000.-': '250K', 'USD 500.000.-': '500K', 'USD 1.000.000.-': '1MM'}
NPD = {'USD 5.000.-': '5K', 'USD 10.000.-': '10K', 'USD 50.000.-': '50K', 'USD 100.000.-': '100K'}
RMPLAN = {'Bs. 700.000.-': 'RM_700K', 'Bs. 140.000.-': 'RM_140K', 'Bs. 70.000.-': 'RM_70K'}
RMK = {'RM_700K': '700', 'RM_140K': '140', 'RM_70K': '70'}
OMITIR = {'S15_MB_h0', 'S19_sin_edad_con_sexo', 'S22_edad_NA', 'S20_sin_sexo_con_edad'}   # errores de datos: el sistema los rechaza (V05, V02; el sexo es obligatorio)
ORDEN = ['IG', 'RM', 'AD', 'MB', 'NP']
COL = {'IG': 'P', 'RM': 'S', 'AD': 'T', 'MB': 'M', 'NP': 'U'}

def ceil(x): return int(Decimal(str(x)).quantize(Decimal('1'), rounding=ROUND_CEILING))
casos = []
for s in esc:
    if s['name'] in OMITIR: continue
    e = s['edits']
    activos = [p for p, c in (('AD', 'C13'), ('RM', 'D13'), ('IG', 'E13'), ('MB', 'F13')) if e.get(c)]
    productos = [p for p in ORDEN if p in activos] + ['NP']          # Naranja+ siempre se calcula en el Excel
    amb = 'BOLIVIA' if e['U7'] == 'BOLIVIA' else 'MUNDIAL_CON_BOLIVIA'
    entrada = {
        'regional': REGION[e['C9']], 'aplicaSars': e['C11'] == 'SI', 'productos': productos,
        'asegurados': [{'parentesco': {'TITULAR': 'TITULAR', 'CONYUGE': 'CONYUGE'}.get(p[0], 'DEPENDIENTE'), 'edad': p[1], 'sexo': SEXO[p[2]]} for p in s['people']],
        'redMax': {'plan': RMPLAN[e['U13']]},
        'mundialBlue': {'cobertura': COV[e['M7']], 'deducible': DED[e['M9']], 'numeroHijos': e['M11']},
        'naranjaPlus': {'ambito': amb, 'valorAsegurado': NPVA[e['U9']], 'deducible': NPD[e['U11']]},
    }
    # esperado del sistema = motor de referencia
    q = dict(region=e['C9'], sars=entrada['aplicaSars'], rm=RMK[RMPLAN[e['U13']]], on={p: 1 for p in activos},
             mb_cov=entrada['mundialBlue']['cobertura'], mb_ded=entrada['mundialBlue']['deducible'], mb_n=e['M11'],
             np=({'BOLIVIA': 'L', 'MUNDIAL_CON_BOLIVIA': 'MB'}[amb], NPVA[e['U9']], NPD[e['U11']]),
             people=[dict(rel=p[0], age=p[1], sex=p[2]) for p in s['people']])
    ref = R.quote(q)
    personas = []
    for i, x in enumerate(s['rows'][:len(s['people'])]):
        personas.append({
            'idx': i,
            'excel': {p: x[COL[p]] for p in productos},
            'esperado': {p: ref[i][p] for p in productos},
        })
    totales = {}
    for p in productos:
        m = sum(r['esperado'][p] for r in personas if isinstance(r['esperado'][p], (int, float)))
        anual = m * 12
        cont = ceil(Decimal(anual) / Decimal('1.1')) if p == 'NP' else ceil(Decimal(anual) * R.PARAM['CONTADO'][p])
        totales[p] = {'mensual': m, 'anual': anual, 'contado': cont}
    casos.append({'nombre': s['name'], 'entrada': entrada, 'personas': personas, 'totales': totales})
json.dump(casos, open(os.path.join(FIX, 'golden.json'), 'w'), ensure_ascii=False, indent=1)
print('tarifas.json y golden.json generados;', len(casos), 'casos')
