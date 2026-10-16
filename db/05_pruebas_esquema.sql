-- Pruebas de las reglas de integridad. Se ejecuta dentro de una transacción que termina en ROLLBACK:
-- no deja datos. Cada prueba imprime PASA / FALLA.
BEGIN;
\o /dev/null

CREATE FUNCTION pg_temp.espera_error(p_nombre text, p_sql text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE p_sql;
        RAISE NOTICE 'FALLA  %: debía rechazarse y se aceptó', p_nombre;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'PASA   %  (%)', p_nombre, left(SQLERRM, 70);
    END;
END $$;

CREATE FUNCTION pg_temp.espera_ok(p_nombre text, p_sql text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE p_sql;
        RAISE NOTICE 'PASA   %', p_nombre;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'FALLA  %: se rechazó (%)', p_nombre, SQLERRM;
    END;
END $$;

INSERT INTO usuario (id, email, nombre) VALUES
 ('00000000-0000-0000-0000-0000000000a1','creador@bisa.test','Creador'),
 ('00000000-0000-0000-0000-0000000000a2','aprobador@bisa.test','Aprobador');

-- ---- Versiones de tarifa -------------------------------------------------
SELECT pg_temp.espera_error('publicar sin aprobador',
  $q$UPDATE version_tarifa SET estado='PUBLICADA' WHERE nombre='Tarifario 2026-05'$q$);
SELECT pg_temp.espera_error('el creador no puede aprobar su propia versión',
  $q$UPDATE version_tarifa SET estado='PUBLICADA', creado_por='00000000-0000-0000-0000-0000000000a1',
        aprobado_por='00000000-0000-0000-0000-0000000000a1', aprobado_en=now() WHERE nombre='Tarifario 2026-05'$q$);
SELECT pg_temp.espera_error('tarifa duplicada (misma clave) en borrador',
  $q$INSERT INTO tarifa (version_id,plan_id,region_id,sexo,edad_desde,edad_hasta,prima,periodicidad,disponible)
     SELECT t.version_id,t.plan_id,t.region_id,t.sexo,t.edad_desde,t.edad_hasta,1,'MENSUAL',true FROM tarifa t LIMIT 1$q$);
SELECT pg_temp.espera_error('prima negativa',
  $q$UPDATE tarifa SET prima=-1 WHERE id=(SELECT min(id) FROM tarifa)$q$);
SELECT pg_temp.espera_error('disponible sin prima',
  $q$UPDATE tarifa SET prima=NULL WHERE id=(SELECT min(id) FROM tarifa WHERE disponible)$q$);

UPDATE version_tarifa SET estado='PUBLICADA',
       creado_por='00000000-0000-0000-0000-0000000000a1',
       aprobado_por='00000000-0000-0000-0000-0000000000a2', aprobado_en=now()
 WHERE nombre='Tarifario 2026-05';
SELECT pg_temp.espera_ok('publicar con aprobador distinto del creador',
  $q$SELECT 1 FROM version_tarifa WHERE estado='PUBLICADA'$q$);
SELECT pg_temp.espera_error('modificar tarifa de versión publicada',
  $q$UPDATE tarifa SET prima=999 WHERE id=(SELECT min(id) FROM tarifa)$q$);
SELECT pg_temp.espera_error('borrar tarifa de versión publicada',
  $q$DELETE FROM tarifa WHERE id=(SELECT min(id) FROM tarifa)$q$);
SELECT pg_temp.espera_error('insertar en versión publicada',
  $q$INSERT INTO tarifa_hijo (version_id,plan_id,numero_hijos,prima_por_hijo)
     SELECT version_id,plan_id,5,1 FROM tarifa_hijo LIMIT 1$q$);
SELECT pg_temp.espera_error('volver una versión publicada a borrador',
  $q$UPDATE version_tarifa SET estado='BORRADOR' WHERE nombre='Tarifario 2026-05'$q$);
SELECT pg_temp.espera_error('versión publicada solapada en vigencia',
  $q$INSERT INTO version_tarifa (nombre,vigente_desde,estado,creado_por,aprobado_por,aprobado_en)
     VALUES ('Otra','2026-06-01','PUBLICADA','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2',now())$q$);
SELECT pg_temp.espera_ok('vista de versión vigente devuelve la publicada',
  $q$SELECT 1/(SELECT count(*) FROM v_version_vigente)$q$);

-- ---- Parámetros ----------------------------------------------------------
SELECT pg_temp.espera_error('parámetro con vigencia solapada',
  $q$INSERT INTO parametro (clave,producto_id,valor,tipo,vigente_desde)
     SELECT 'SARS_RECARGO', id, 11, 'MONTO_FIJO', '2026-07-01' FROM producto WHERE codigo='IG'$q$);

-- ---- Cotizaciones --------------------------------------------------------
INSERT INTO cotizacion (id, creada_por, valida_hasta, titular_nombre, region_id, aplica_sars, version_tarifa_id, entrada, parametros_usados)
SELECT '00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1', current_date+14, 'Cliente Prueba',
       (SELECT id FROM region WHERE codigo='LPZ'), false, (SELECT id FROM version_tarifa LIMIT 1), '{}', '{}';

SELECT pg_temp.espera_ok('numero de cotización autogenerado',
  $q$SELECT 1/(SELECT count(*) FROM cotizacion WHERE numero ~ '^COT-[0-9]{4}-[0-9]{6}$')$q$);

INSERT INTO cotizacion_asegurado (cotizacion_id, orden, parentesco_id, edad, sexo)
SELECT '00000000-0000-0000-0000-0000000000c1', 1, id, 30, 'MASCULINO' FROM parentesco WHERE codigo='TITULAR';

SELECT pg_temp.espera_error('segundo titular',
  $q$INSERT INTO cotizacion_asegurado (cotizacion_id, orden, parentesco_id, edad, sexo)
     SELECT '00000000-0000-0000-0000-0000000000c1', 2, id, 40, 'MASCULINO' FROM parentesco WHERE codigo='TITULAR'$q$);
SELECT pg_temp.espera_error('dependiente con maternidad',
  $q$INSERT INTO cotizacion_asegurado (cotizacion_id, orden, parentesco_id, edad, sexo)
     SELECT '00000000-0000-0000-0000-0000000000c1', 2, id, 20, 'FEMENINO_CON_MATERNIDAD' FROM parentesco WHERE codigo='DEPENDIENTE'$q$);
SELECT pg_temp.espera_error('edad 100',
  $q$INSERT INTO cotizacion_asegurado (cotizacion_id, orden, parentesco_id, edad, sexo)
     SELECT '00000000-0000-0000-0000-0000000000c1', 2, id, 100, 'MASCULINO' FROM parentesco WHERE codigo='DEPENDIENTE'$q$);
SELECT pg_temp.espera_error('orden 8 (más de 7 asegurados)',
  $q$INSERT INTO cotizacion_asegurado (cotizacion_id, orden, parentesco_id, edad, sexo)
     SELECT '00000000-0000-0000-0000-0000000000c1', 8, id, 10, 'MASCULINO' FROM parentesco WHERE codigo='DEPENDIENTE'$q$);
SELECT pg_temp.espera_ok('cónyuge con maternidad',
  $q$INSERT INTO cotizacion_asegurado (cotizacion_id, orden, parentesco_id, edad, sexo)
     SELECT '00000000-0000-0000-0000-0000000000c1', 2, id, 28, 'FEMENINO_CON_MATERNIDAD' FROM parentesco WHERE codigo='CONYUGE'$q$);

-- 5 dependientes sí, el sexto no
INSERT INTO cotizacion_asegurado (cotizacion_id, orden, parentesco_id, edad, sexo)
SELECT '00000000-0000-0000-0000-0000000000c1', 2+g, pa.id, 5+g, 'MASCULINO' FROM parentesco pa, generate_series(1,5) g WHERE pa.codigo='DEPENDIENTE';
SELECT pg_temp.espera_error('sexto dependiente',
  $q$INSERT INTO cotizacion_asegurado (cotizacion_id, orden, parentesco_id, edad, sexo)
     SELECT '00000000-0000-0000-0000-0000000000c1', 7, id, 3, 'MASCULINO' FROM parentesco WHERE codigo='DEPENDIENTE'$q$);

SELECT pg_temp.espera_error('línea OK sin prima',
  $q$INSERT INTO cotizacion_linea (cotizacion_id, asegurado_id, producto_id, estado, detalle)
     SELECT '00000000-0000-0000-0000-0000000000c1', a.id, p.id, 'OK', '[]' FROM cotizacion_asegurado a, producto p WHERE a.orden=1 AND p.codigo='IG'$q$);
SELECT pg_temp.espera_error('línea NO_DISPONIBLE sin motivo',
  $q$INSERT INTO cotizacion_linea (cotizacion_id, asegurado_id, producto_id, estado, detalle)
     SELECT '00000000-0000-0000-0000-0000000000c1', a.id, p.id, 'NO_DISPONIBLE', '[]' FROM cotizacion_asegurado a, producto p WHERE a.orden=1 AND p.codigo='IG'$q$);
SELECT pg_temp.espera_ok('línea válida',
  $q$INSERT INTO cotizacion_linea (cotizacion_id, asegurado_id, producto_id, estado, prima_mensual, detalle)
     SELECT '00000000-0000-0000-0000-0000000000c1', a.id, p.id, 'OK', 66, '[]' FROM cotizacion_asegurado a, producto p WHERE a.orden=1 AND p.codigo='IG'$q$);
SELECT pg_temp.espera_error('total combinado con producto',
  $q$INSERT INTO cotizacion_total (cotizacion_id, es_combinada, producto_id, mensual, anual, contado)
     SELECT '00000000-0000-0000-0000-0000000000c1', true, id, 1, 12, 12 FROM producto LIMIT 1$q$);

-- ---- Emisión: la cotización queda congelada ------------------------------
UPDATE cotizacion SET estado='CALCULADA' WHERE id='00000000-0000-0000-0000-0000000000c1';
UPDATE cotizacion SET estado='EMITIDA'   WHERE id='00000000-0000-0000-0000-0000000000c1';
SELECT pg_temp.espera_error('modificar línea de cotización emitida',
  $q$UPDATE cotizacion_linea SET prima_mensual=1 WHERE cotizacion_id='00000000-0000-0000-0000-0000000000c1'$q$);
SELECT pg_temp.espera_error('agregar asegurado a cotización emitida',
  $q$INSERT INTO cotizacion_asegurado (cotizacion_id, orden, parentesco_id, edad, sexo)
     SELECT '00000000-0000-0000-0000-0000000000c1', 7, id, 3, 'MASCULINO' FROM parentesco WHERE codigo='CONYUGE'$q$);
SELECT pg_temp.espera_error('cambiar los datos de una cotización emitida',
  $q$UPDATE cotizacion SET entrada='{"x":1}' WHERE id='00000000-0000-0000-0000-0000000000c1'$q$);
SELECT pg_temp.espera_error('volver a borrador una cotización emitida',
  $q$UPDATE cotizacion SET estado='BORRADOR' WHERE id='00000000-0000-0000-0000-0000000000c1'$q$);
SELECT pg_temp.espera_ok('anular una cotización emitida',
  $q$UPDATE cotizacion SET estado='ANULADA' WHERE id='00000000-0000-0000-0000-0000000000c1'$q$);
SELECT pg_temp.espera_error('reactivar una cotización anulada',
  $q$UPDATE cotizacion SET estado='CALCULADA' WHERE id='00000000-0000-0000-0000-0000000000c1'$q$);

-- ---- Auditoría -----------------------------------------------------------
INSERT INTO auditoria (accion, entidad, entidad_id) VALUES ('PRUEBA','cotizacion','1');
SELECT pg_temp.espera_error('modificar auditoría', $q$UPDATE auditoria SET accion='X'$q$);
SELECT pg_temp.espera_error('borrar auditoría',    $q$DELETE FROM auditoria$q$);

\o
ROLLBACK;
