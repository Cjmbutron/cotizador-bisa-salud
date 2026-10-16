#!/usr/bin/env python3
"""Convierte los resultados del Excel de la conciliación masiva en fixtures/conciliacion_excel.json."""
import glob, json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'conciliacion'))
RES = sys.argv[1] if len(sys.argv) > 1 else '/tmp/c3/res'
FIX = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'fixtures')
REGION = {'LA PAZ': 'LPZ', 'COCHABAMBA': 'CBBA', 'SANTA CRUZ': 'SCZ', 'CHUQUISACA': 'CHQ', 'TARIJA': 'TJA'}
SEXO = {'MASCULINO': 'MASCULINO', 'FEMENINO SIN MATERNIDAD': 'FEMENINO_SIN_MATERNIDAD', 'FEMENINO CON MATERNIDAD': 'FEMENINO_CON_MATERNIDAD'}
COV = {'USD 1.000.000.-': '1MM', 'USD 2.000.000.-': '2MM', 'USD 5.000.000.-': '5MM'}
DED = {'USD 1.000.-': '1K', 'USD 2.000.-': '2K', 'USD 3.000.-': '3K', 'USD 5.000.-': '5K', 'USD 10.000.-': '10K', 'USD 20.000.-': '20K'}
NPV = {'USD 50.000.-': '50K', 'USD 100.000.-': '100K', 'USD 150.000.-': '150K', 'USD 250.000.-': '250K', 'USD 500.000.-': '500K', 'USD 1.000.000.-': '1MM'}
NPD = {'USD 5.000.-': '5K', 'USD 10.000.-': '10K', 'USD 50.000.-': '50K', 'USD 100.000.-': '100K'}
RM = {'Bs. 700.000.-': 'RM_700K', 'Bs. 140.000.-': 'RM_140K', 'Bs. 70.000.-': 'RM_70K'}
COL = {'IG': 'P', 'RM': 'S', 'AD': 'T', 'MB': 'M', 'NP': 'U'}
casos = []
for f in sorted(glob.glob(os.path.join(RES, '*.json'))):
    s = json.load(open(f))
    e = s['edits']
    amb = 'BOLIVIA' if e['U7'] == 'BOLIVIA' else 'MUNDIAL_CON_BOLIVIA'
    entrada = {
        'regional': REGION[e['C9']], 'aplicaSars': e['C11'] == 'SI', 'productos': ['IG', 'RM', 'AD', 'MB', 'NP'],
        'asegurados': [{'parentesco': {'TITULAR': 'TITULAR', 'CONYUGE': 'CONYUGE'}.get(p[0], 'DEPENDIENTE'), 'edad': p[1], 'sexo': SEXO[p[2]]} for p in s['people']],
        'redMax': {'plan': RM[e['U13']]},
        'mundialBlue': {'cobertura': COV[e['M7']], 'deducible': DED[e['M9']], 'numeroHijos': e['M11']},
        'naranjaPlus': {'ambito': amb, 'valorAsegurado': NPV[e['U9']], 'deducible': NPD[e['U11']]},
    }
    personas = [{'idx': i, 'excel': {p: x[c] for p, c in COL.items()}} for i, x in enumerate(s['rows'][:len(s['people'])])]
    casos.append({'nombre': s['name'], 'entrada': entrada, 'personas': personas})
json.dump(casos, open(os.path.join(FIX, 'conciliacion_excel.json'), 'w'), ensure_ascii=False)
print(len(casos), 'escenarios,', sum(len(c['personas']) for c in casos) * 5, 'primas')
