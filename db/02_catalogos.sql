-- Catálogos fijos: regionales, productos, parentescos, roles y plantillas de documento
BEGIN;

INSERT INTO region (codigo, nombre, orden) VALUES
 ('LPZ','LA PAZ',1), ('CBBA','COCHABAMBA',2), ('SCZ','SANTA CRUZ',3), ('CHQ','CHUQUISACA',4), ('TJA','TARIJA',5);

-- Moneda de la prima: IG, MB y NP en USD; RM y AD en Bs. (confirmado por el negocio)
INSERT INTO producto (codigo, nombre, moneda_prima, tarifa_por_region, tarifa_por_sexo) VALUES
 ('IG','Infinity Green','USD', true,  true),
 ('RM','Red Max',       'BOB', true,  true),
 ('AD','Advance',       'BOB', true,  true),
 ('MB','Mundial Blue',  'USD', false, false),
 ('NP','Naranja+',      'USD', false, false);

INSERT INTO parentesco (codigo, nombre, orden, max_por_cotizacion, permite_maternidad) VALUES
 ('TITULAR',     'Titular',            1, 1, true),
 ('CONYUGE',     'Cónyuge',            2, 1, true),
 ('DEPENDIENTE', 'Hijo/a u otro dependiente', 3, 5, false);

INSERT INTO rol (codigo, descripcion) VALUES
 ('COMERCIAL',        'Crea, calcula, guarda y emite cotizaciones propias'),
 ('SUPERVISOR',       'Consulta y exporta cotizaciones de su equipo'),
 ('ADMIN_TARIFAS',    'Prepara versiones de tarifas y parámetros en borrador'),
 ('APROBADOR_TARIFAS','Publica versiones de tarifas (no puede aprobar las que creó)'),
 ('AUDITOR',          'Solo lectura de cotizaciones y auditoría'),
 ('ADMIN_TI',         'Usuarios, roles y configuración');

-- 13 plantillas de propuesta (hojas ocultas CM/SM del Excel). "archivo" es el nombre de la hoja de origen.
INSERT INTO plantilla_documento (producto_id, variante, con_maternidad, archivo)
SELECT p.id, v.variante, v.mat, v.archivo
  FROM (VALUES
    ('IG', NULL,  true,  'Infinity CM'), ('IG', NULL,  false, 'Infinity SM'),
    ('RM', NULL,  true,  'RedMax CM'),   ('RM', NULL,  false, 'RedMax SM'),
    ('AD', NULL,  true,  'Advance CM'),  ('AD', NULL,  false, 'Advance SM'),
    ('MB', '1MM', true,  'MB 1 CM'),     ('MB', '1MM', false, 'MB 1 SM'),
    ('MB', '2MM', true,  'MB 2 CM'),     ('MB', '2MM', false, 'MB 2 SM'),
    ('MB', '5MM', true,  'MB 5 CM'),     ('MB', '5MM', false, 'MB 5 SM'),
    ('NP', NULL,  NULL,  'Naranja +')
  ) AS v(prod, variante, mat, archivo)
  JOIN producto p ON p.codigo = v.prod;

COMMIT;
