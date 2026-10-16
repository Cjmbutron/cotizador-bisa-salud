-- Paso 7: propuestas en PDF
-- 1) Las plantillas se identifican por su clave de archivo JSON (apps/api/plantillas/<clave>.json).
-- 2) El texto de cada plantilla es PROVISIONAL (copiado del Excel) hasta que el área comercial lo apruebe.
--    Mientras no esté aprobado, el PDF lleva marca de agua "TEXTO PROVISIONAL".
-- 3) Rol nuevo: REVISOR_COMERCIAL (aprueba el texto de las plantillas).
BEGIN;

ALTER TABLE plantilla_documento
    ADD COLUMN texto_aprobado boolean     NOT NULL DEFAULT false,
    ADD COLUMN aprobado_por   uuid        REFERENCES usuario(id),
    ADD COLUMN aprobado_en    timestamptz,
    ADD COLUMN hash_aprobado  char(64),   -- sha256 del contenido aprobado: si el archivo cambia, la aprobación deja de valer
    ADD CONSTRAINT ck_plantilla_aprobacion CHECK (
        (texto_aprobado AND aprobado_por IS NOT NULL AND aprobado_en IS NOT NULL AND hash_aprobado IS NOT NULL)
     OR (NOT texto_aprobado));

UPDATE plantilla_documento SET archivo = CASE archivo
    WHEN 'Infinity CM' THEN 'IG_CM'  WHEN 'Infinity SM' THEN 'IG_SM'
    WHEN 'RedMax CM'   THEN 'RM_CM'  WHEN 'RedMax SM'   THEN 'RM_SM'
    WHEN 'Advance CM'  THEN 'AD_CM'  WHEN 'Advance SM'  THEN 'AD_SM'
    WHEN 'MB 1 CM' THEN 'MB_1MM_CM'  WHEN 'MB 1 SM' THEN 'MB_1MM_SM'
    WHEN 'MB 2 CM' THEN 'MB_2MM_CM'  WHEN 'MB 2 SM' THEN 'MB_2MM_SM'
    WHEN 'MB 5 CM' THEN 'MB_5MM_CM'  WHEN 'MB 5 SM' THEN 'MB_5MM_SM'
    WHEN 'Naranja +' THEN 'NP' ELSE archivo END;

INSERT INTO rol (codigo, descripcion)
VALUES ('REVISOR_COMERCIAL', 'Aprueba el texto de las plantillas de propuesta (beneficios, exclusiones, condiciones)');

COMMIT;
