-- Parámetros de negocio con vigencia. Valores del Excel y decisiones del negocio (R1-R14, 17.4, 17.5).
-- Ejecutar DESPUÉS de 03_planes_y_tarifas.sql (algunos parámetros apuntan a planes).
-- Ajustar la fecha de vigencia inicial si corresponde.
BEGIN;

-- Parámetros por producto
INSERT INTO parametro (clave, producto_id, valor, tipo, descripcion, vigente_desde)
SELECT v.clave, p.id, v.valor, v.tipo::tipo_parametro, v.descr, DATE '2026-05-01'
  FROM (VALUES
   ('SARS_RECARGO',           'IG',  10,        'MONTO_FIJO', 'Recargo mensual SARS COVID-19 por asegurado (USD)'),
   ('SARS_RECARGO',           'RM',  70,        'MONTO_FIJO', 'Recargo mensual SARS COVID-19 por asegurado (Bs.)'),
   ('MATERNIDAD_RECARGO',     'IG',  20,        'MONTO_FIJO', 'Extra prima mensual por cada mujer con maternidad (USD). Decisión 17.5'),
   ('MATERNIDAD_RECARGO',     'RM',  140,       'MONTO_FIJO', 'Extra prima mensual por cada mujer con maternidad (Bs.). Decisión 17.5'),
   ('MATERNIDAD_EDAD_MIN',    'IG',  19,        'EDAD',       'Edad mínima con cobertura de maternidad'),
   ('MATERNIDAD_EDAD_MAX',    'IG',  49,        'EDAD',       'Edad máxima con cobertura de maternidad'),
   ('MATERNIDAD_EDAD_MIN',    'RM',  19,        'EDAD',       'Edad mínima con cobertura de maternidad'),
   ('MATERNIDAD_EDAD_MAX',    'RM',  49,        'EDAD',       'Edad máxima con cobertura de maternidad'),
   ('MATERNIDAD_EDAD_MIN',    'AD',  19,        'EDAD',       'Edad mínima con cobertura de maternidad'),
   ('MATERNIDAD_EDAD_MAX',    'AD',  49,        'EDAD',       'Edad máxima con cobertura de maternidad'),
   ('CONTADO_FACTOR',         'IG',  0.975,     'FACTOR',     'Pago anual al contado: anual x factor, redondeo al entero superior'),
   ('CONTADO_FACTOR',         'RM',  0.975,     'FACTOR',     'Idem'),
   ('CONTADO_FACTOR',         'AD',  0.975,     'FACTOR',     'Idem'),
   ('CONTADO_FACTOR',         'MB',  0.909,     'FACTOR',     'Idem'),
   ('CONTADO_DIVISOR',        'NP',  1.1,       'FACTOR',     'Naranja+: contado = anual / divisor, redondeo al entero superior'),
   ('MB_EDAD_ADULTO_TITULAR_CONYUGE', 'MB', 18, 'EDAD',       'Desde esta edad titular y cónyuge pagan tarifa de adulto'),
   ('MB_EDAD_ADULTO_DEPENDIENTE',     'MB', 25, 'EDAD',       'Desde esta edad un dependiente paga tarifa de adulto'),
   ('NP_DIVISOR',             'NP',  1.2675,    'FACTOR',     'Naranja+: prima mensual = techo(anual/12) / divisor ...'),
   ('NP_FACTOR_1',            'NP',  1.3,       'FACTOR',     '... x factor 1, redondeo ...'),
   ('NP_FACTOR_2',            'NP',  1.1,       'FACTOR',     '... x factor 2, redondeo'),
   ('NP_EDAD_MAX',            'NP',  64,        'EDAD',       'Mayores a esta edad: excluido'),
   ('NP_EXCLUSION_MATERNIDAD_EDAD_MAX', 'NP', 18, 'EDAD',     'Mujer con maternidad de 1 a esta edad: excluida')
  ) AS v(clave, prod, valor, tipo, descr)
  JOIN producto p ON p.codigo = v.prod;

-- Descuento de Red Max por valor asegurado (se resta de la tarifa de 700.000)
INSERT INTO parametro (clave, plan_id, valor, tipo, descripcion, vigente_desde)
SELECT 'RM_DESCUENTO', pl.id, v.valor, 'MONTO_FIJO', 'Descuento mensual (Bs.) sobre la tarifa de Bs. 700.000', DATE '2026-05-01'
  FROM (VALUES ('RM_700K', 0), ('RM_140K', 28), ('RM_70K', 49)) AS v(plan, valor)
  JOIN plan pl ON pl.codigo = v.plan;

-- Parámetros globales
INSERT INTO parametro (clave, valor, tipo, descripcion, vigente_desde) VALUES
 ('COMBINADA_INCLUYE_SARS',            0,  'BOOLEANO', 'La suma combinada ignora el SARS (R2). Poner 1 para incluirlo', DATE '2026-05-01'),
 ('COTIZACION_VALIDEZ_DIAS_HABILES',   10, 'DIAS',     'Validez de la cotización en días hábiles',                      DATE '2026-05-01'),
 ('EDAD_MAXIMA_ASEGURADO',             99, 'EDAD',     'Edad máxima admitida en la nómina',                              DATE '2026-05-01');

COMMIT;
