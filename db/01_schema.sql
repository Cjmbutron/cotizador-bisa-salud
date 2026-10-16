-- =====================================================================
-- Cotizador BISA Salud: esquema PostgreSQL (>= 13)
-- Ejecutar con un usuario propietario de la base. Idempotencia: no (ver README).
-- =====================================================================
BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;   -- restricciones de exclusión (rangos sin solapamiento)

-- ---------- Tipos --------------------------------------------------------
CREATE TYPE estado_version     AS ENUM ('BORRADOR','EN_REVISION','PUBLICADA','ARCHIVADA');
CREATE TYPE periodicidad       AS ENUM ('MENSUAL','ANUAL');
CREATE TYPE sexo_asegurado     AS ENUM ('MASCULINO','FEMENINO_SIN_MATERNIDAD','FEMENINO_CON_MATERNIDAD');
CREATE TYPE tipo_parametro     AS ENUM ('MONTO_FIJO','FACTOR','EDAD','DIAS','BOOLEANO');
CREATE TYPE estado_cotizacion  AS ENUM ('BORRADOR','CALCULADA','EMITIDA','ANULADA');
CREATE TYPE estado_linea       AS ENUM ('OK','NO_DISPONIBLE','EXCLUIDO');

-- ---------- Seguridad ----------------------------------------------------
CREATE TABLE usuario (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email          varchar(160) NOT NULL,
    nombre         varchar(120) NOT NULL,
    activo         boolean      NOT NULL DEFAULT true,
    ultimo_acceso  timestamptz,
    creado_en      timestamptz  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_usuario_email ON usuario (lower(email));

CREATE TABLE rol (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo       varchar(30)  NOT NULL UNIQUE,
    descripcion  varchar(200) NOT NULL
);

CREATE TABLE usuario_rol (
    usuario_id uuid NOT NULL REFERENCES usuario(id),
    rol_id     uuid NOT NULL REFERENCES rol(id),
    PRIMARY KEY (usuario_id, rol_id)
);

-- ---------- Catálogos ----------------------------------------------------
CREATE TABLE region (
    id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo  varchar(10) NOT NULL UNIQUE,
    nombre  varchar(40) NOT NULL,
    orden   smallint    NOT NULL DEFAULT 0,
    activa  boolean     NOT NULL DEFAULT true
);

CREATE TABLE producto (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo             varchar(4)  NOT NULL UNIQUE,
    nombre             varchar(40) NOT NULL,
    moneda_prima       char(3)     NOT NULL CHECK (moneda_prima IN ('USD','BOB')),
    tarifa_por_region  boolean     NOT NULL,
    tarifa_por_sexo    boolean     NOT NULL,
    activo             boolean     NOT NULL DEFAULT true
);

CREATE TABLE plan (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    producto_id      uuid         NOT NULL REFERENCES producto(id),
    codigo           varchar(40)  NOT NULL UNIQUE,
    nombre           varchar(120) NOT NULL,
    ambito           varchar(30),                       -- Naranja+: BOLIVIA | MUNDIAL_CON_BOLIVIA
    valor_asegurado  numeric(14,2),
    moneda_va        char(3)      CHECK (moneda_va IN ('USD','BOB')),
    deducible        numeric(12,2),                     -- MB y Naranja+ (USD)
    plan_base_id     uuid REFERENCES plan(id),          -- Red Max 140K/70K usan la tarifa de 700K
    activo           boolean      NOT NULL DEFAULT true,
    CHECK (plan_base_id IS NULL OR plan_base_id <> id)
);
CREATE INDEX ix_plan_producto ON plan (producto_id);

CREATE TABLE parentesco (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo              varchar(15) NOT NULL UNIQUE,
    nombre              varchar(40) NOT NULL,
    orden               smallint    NOT NULL,
    max_por_cotizacion  smallint    NOT NULL CHECK (max_por_cotizacion > 0),
    permite_maternidad  boolean     NOT NULL
);

-- ---------- Tarifas versionadas -----------------------------------------
CREATE TABLE version_tarifa (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre               varchar(80) NOT NULL UNIQUE,
    vigente_desde        date        NOT NULL,
    vigente_hasta        date,
    estado               estado_version NOT NULL DEFAULT 'BORRADOR',
    respaldo_documental  text,
    creado_por           uuid REFERENCES usuario(id),
    creado_en            timestamptz NOT NULL DEFAULT now(),
    aprobado_por         uuid REFERENCES usuario(id),
    aprobado_en          timestamptz,
    CHECK (vigente_hasta IS NULL OR vigente_hasta > vigente_desde),
    -- una versión publicada necesita aprobador, y no puede aprobarla quien la creó
    CHECK (estado NOT IN ('PUBLICADA','ARCHIVADA')
           OR (aprobado_por IS NOT NULL AND aprobado_en IS NOT NULL
               AND (creado_por IS NULL OR aprobado_por <> creado_por))),
    -- dos versiones publicadas no pueden solaparse en el tiempo
    EXCLUDE USING gist (daterange(vigente_desde, vigente_hasta, '[)') WITH &&)
        WHERE (estado = 'PUBLICADA')
);

CREATE TABLE tarifa (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    version_id   uuid NOT NULL REFERENCES version_tarifa(id),
    plan_id      uuid NOT NULL REFERENCES plan(id),
    region_id    uuid REFERENCES region(id),            -- solo IG, RM, AD
    sexo         varchar(3) CHECK (sexo IN ('M','F','F-M')),  -- solo IG, RM, AD
    edad_desde   smallint NOT NULL CHECK (edad_desde BETWEEN 0 AND 120),
    edad_hasta   smallint NOT NULL CHECK (edad_hasta BETWEEN 0 AND 120),
    prima        numeric(12,4),                         -- NULL = "N/A" del Excel
    periodicidad periodicidad NOT NULL,
    disponible   boolean NOT NULL,
    CHECK (edad_desde <= edad_hasta),
    CHECK (prima IS NULL OR prima >= 0),
    CHECK (disponible = (prima IS NOT NULL)),
    EXCLUDE USING gist (
        version_id WITH =, plan_id WITH =,
        (coalesce(region_id, '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
        (coalesce(sexo, '')) WITH =,
        int4range(edad_desde, edad_hasta, '[]') WITH &&
    )
);
CREATE INDEX ix_tarifa_busqueda ON tarifa (version_id, plan_id, region_id, sexo, edad_desde);

CREATE TABLE tarifa_hijo (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    version_id       uuid NOT NULL REFERENCES version_tarifa(id),
    plan_id          uuid NOT NULL REFERENCES plan(id),
    numero_hijos     smallint NOT NULL CHECK (numero_hijos BETWEEN 1 AND 5),
    prima_por_hijo   numeric(14,6) NOT NULL CHECK (prima_por_hijo >= 0),
    UNIQUE (version_id, plan_id, numero_hijos)
);

-- ---------- Parámetros con vigencia -------------------------------------
CREATE TABLE parametro (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clave          varchar(60) NOT NULL,
    producto_id    uuid REFERENCES producto(id),
    plan_id        uuid REFERENCES plan(id),
    valor          numeric(18,6) NOT NULL,
    tipo           tipo_parametro NOT NULL,
    descripcion    varchar(200),
    vigente_desde  date NOT NULL,
    vigente_hasta  date,
    creado_por     uuid REFERENCES usuario(id),
    creado_en      timestamptz NOT NULL DEFAULT now(),
    CHECK (vigente_hasta IS NULL OR vigente_hasta > vigente_desde),
    EXCLUDE USING gist (
        clave WITH =,
        (coalesce(producto_id, '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
        (coalesce(plan_id,     '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
        daterange(vigente_desde, vigente_hasta, '[)') WITH &&
    )
);

CREATE TABLE plantilla_documento (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    producto_id     uuid NOT NULL REFERENCES producto(id),
    variante        varchar(10),                         -- MB: 1MM | 2MM | 5MM
    con_maternidad  boolean,                             -- NULL = no aplica (Naranja+)
    version         smallint NOT NULL DEFAULT 1,
    archivo         varchar(200) NOT NULL,               -- referencia a la plantilla en el repositorio de archivos
    activa          boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX ux_plantilla ON plantilla_documento
    (producto_id, coalesce(variante,''),
     (CASE WHEN con_maternidad IS NULL THEN 0 WHEN con_maternidad THEN 1 ELSE 2 END), version);

-- ---------- Cotizaciones -------------------------------------------------
CREATE SEQUENCE seq_cotizacion;

CREATE TABLE cotizacion (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    numero               varchar(20) NOT NULL UNIQUE
                         DEFAULT ('COT-' || to_char(now(),'YYYY') || '-' || lpad(nextval('seq_cotizacion')::text, 6, '0')),
    creada_por           uuid NOT NULL REFERENCES usuario(id),
    creada_en            timestamptz NOT NULL DEFAULT now(),
    valida_hasta         date NOT NULL,
    titular_nombre       varchar(120) NOT NULL,
    region_id            uuid NOT NULL REFERENCES region(id),
    aplica_sars          boolean NOT NULL,
    version_tarifa_id    uuid NOT NULL REFERENCES version_tarifa(id),
    redmax_plan_id       uuid REFERENCES plan(id),
    mb_plan_id           uuid REFERENCES plan(id),
    mb_numero_hijos      smallint CHECK (mb_numero_hijos BETWEEN 1 AND 5),
    np_plan_id           uuid REFERENCES plan(id),
    entrada              jsonb NOT NULL,                  -- copia exacta de lo que recibió el motor
    parametros_usados    jsonb NOT NULL,                  -- valores de parámetros al calcular
    estado               estado_cotizacion NOT NULL DEFAULT 'BORRADOR'
);
CREATE INDEX ix_cotizacion_creada ON cotizacion (creada_en DESC);
CREATE INDEX ix_cotizacion_usuario ON cotizacion (creada_por, creada_en DESC);
CREATE INDEX ix_cotizacion_titular ON cotizacion (lower(titular_nombre));

CREATE TABLE cotizacion_producto (
    cotizacion_id uuid NOT NULL REFERENCES cotizacion(id) ON DELETE CASCADE,
    producto_id   uuid NOT NULL REFERENCES producto(id),
    PRIMARY KEY (cotizacion_id, producto_id)
);

CREATE TABLE cotizacion_asegurado (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cotizacion_id        uuid NOT NULL REFERENCES cotizacion(id) ON DELETE CASCADE,
    orden                smallint NOT NULL CHECK (orden BETWEEN 1 AND 7),
    parentesco_id        uuid NOT NULL REFERENCES parentesco(id),
    edad                 smallint NOT NULL CHECK (edad BETWEEN 0 AND 99),
    sexo                 sexo_asegurado NOT NULL,
    producto_elegido_id  uuid REFERENCES producto(id),
    UNIQUE (cotizacion_id, orden)
);

CREATE TABLE cotizacion_linea (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cotizacion_id         uuid NOT NULL REFERENCES cotizacion(id) ON DELETE CASCADE,
    asegurado_id          uuid NOT NULL REFERENCES cotizacion_asegurado(id) ON DELETE CASCADE,
    producto_id           uuid NOT NULL REFERENCES producto(id),
    estado                estado_linea NOT NULL,
    motivo                varchar(160),
    prima_base            numeric(14,4),
    recargo_maternidad    numeric(14,4),
    recargo_sars          numeric(14,4),
    prima_mensual         numeric(14,4),
    prima_mensual_sin_sars numeric(14,4),
    detalle               jsonb NOT NULL,
    UNIQUE (asegurado_id, producto_id),
    CHECK (estado <> 'OK' OR prima_mensual IS NOT NULL),
    CHECK (estado = 'OK' OR motivo IS NOT NULL)
);

CREATE TABLE cotizacion_total (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cotizacion_id  uuid NOT NULL REFERENCES cotizacion(id) ON DELETE CASCADE,
    es_combinada   boolean NOT NULL DEFAULT false,
    producto_id    uuid REFERENCES producto(id),
    mensual        numeric(14,2) NOT NULL,
    anual          numeric(14,2) NOT NULL,
    contado        numeric(14,2) NOT NULL,
    CHECK (es_combinada = (producto_id IS NULL))
);
CREATE UNIQUE INDEX ux_total ON cotizacion_total
    (cotizacion_id, es_combinada, coalesce(producto_id,'00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE cotizacion_documento (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cotizacion_id  uuid NOT NULL REFERENCES cotizacion(id),
    plantilla_id   uuid NOT NULL REFERENCES plantilla_documento(id),
    archivo        varchar(300) NOT NULL,
    hash_sha256    char(64) NOT NULL,
    generado_por   uuid NOT NULL REFERENCES usuario(id),
    generado_en    timestamptz NOT NULL DEFAULT now()
);

-- ---------- Auditoría (solo inserción) ----------------------------------
CREATE TABLE auditoria (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id  uuid REFERENCES usuario(id),
    accion      varchar(40)  NOT NULL,
    entidad     varchar(40)  NOT NULL,
    entidad_id  text,
    antes       jsonb,
    despues     jsonb,
    ip          inet,
    creada_en   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_auditoria_entidad ON auditoria (entidad, entidad_id, creada_en DESC);

-- =====================================================================
-- Reglas de integridad que una restricción CHECK no puede expresar
-- =====================================================================

-- 1) Auditoría inmutable
CREATE FUNCTION fn_auditoria_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'La tabla auditoria es de solo inserción';
END $$;
CREATE TRIGGER trg_auditoria_inmutable BEFORE UPDATE OR DELETE ON auditoria
    FOR EACH ROW EXECUTE FUNCTION fn_auditoria_inmutable();

-- 2) Tarifas de una versión publicada o archivada no se tocan
CREATE FUNCTION fn_tarifa_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_id uuid; v_estado estado_version;
BEGIN
    v_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.version_id ELSE NEW.version_id END;
    SELECT estado INTO v_estado FROM version_tarifa WHERE id = v_id;
    IF v_estado IN ('PUBLICADA','ARCHIVADA') THEN
        RAISE EXCEPTION 'La versión de tarifas % está % y no admite cambios', v_id, v_estado;
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER trg_tarifa_inmutable BEFORE INSERT OR UPDATE OR DELETE ON tarifa
    FOR EACH ROW EXECUTE FUNCTION fn_tarifa_inmutable();
CREATE TRIGGER trg_tarifa_hijo_inmutable BEFORE INSERT OR UPDATE OR DELETE ON tarifa_hijo
    FOR EACH ROW EXECUTE FUNCTION fn_tarifa_inmutable();

-- 3) Ciclo de vida de la versión: no se retrocede desde PUBLICADA/ARCHIVADA
CREATE FUNCTION fn_version_ciclo() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.estado IN ('PUBLICADA','ARCHIVADA') THEN
            RAISE EXCEPTION 'No se puede eliminar una versión % ', OLD.estado;
        END IF;
        RETURN OLD;
    END IF;
    IF OLD.estado = 'PUBLICADA' AND NEW.estado NOT IN ('PUBLICADA','ARCHIVADA') THEN
        RAISE EXCEPTION 'Una versión publicada solo puede pasar a ARCHIVADA';
    END IF;
    IF OLD.estado = 'ARCHIVADA' AND NEW.estado <> 'ARCHIVADA' THEN
        RAISE EXCEPTION 'Una versión archivada no puede cambiar de estado';
    END IF;
    IF OLD.estado IN ('PUBLICADA','ARCHIVADA')
       AND (NEW.vigente_desde <> OLD.vigente_desde OR NEW.nombre <> OLD.nombre) THEN
        RAISE EXCEPTION 'Nombre y vigencia de inicio de una versión publicada no se modifican';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_version_ciclo BEFORE UPDATE OR DELETE ON version_tarifa
    FOR EACH ROW EXECUTE FUNCTION fn_version_ciclo();

-- 4) Reglas de la nómina: máximos por parentesco y maternidad solo donde corresponde
CREATE FUNCTION fn_asegurado_reglas() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p parentesco%ROWTYPE; n int; v_estado estado_cotizacion;
BEGIN
    SELECT estado INTO v_estado FROM cotizacion WHERE id = NEW.cotizacion_id;
    IF v_estado IN ('EMITIDA','ANULADA') THEN
        RAISE EXCEPTION 'La cotización está % y no admite cambios en la nómina', v_estado;
    END IF;
    SELECT * INTO p FROM parentesco WHERE id = NEW.parentesco_id;
    IF NEW.sexo = 'FEMENINO_CON_MATERNIDAD' AND NOT p.permite_maternidad THEN
        RAISE EXCEPTION 'El parentesco % no admite maternidad', p.codigo;
    END IF;
    SELECT count(*) INTO n FROM cotizacion_asegurado
     WHERE cotizacion_id = NEW.cotizacion_id AND parentesco_id = NEW.parentesco_id
       AND id IS DISTINCT FROM NEW.id;
    IF n + 1 > p.max_por_cotizacion THEN
        RAISE EXCEPTION 'Se excede el máximo de % asegurados con parentesco %', p.max_por_cotizacion, p.codigo;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_asegurado_reglas BEFORE INSERT OR UPDATE ON cotizacion_asegurado
    FOR EACH ROW EXECUTE FUNCTION fn_asegurado_reglas();

-- 5) Una cotización emitida o anulada no cambia sus resultados
CREATE FUNCTION fn_resultado_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_id uuid; v_estado estado_cotizacion;
BEGIN
    v_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.cotizacion_id ELSE NEW.cotizacion_id END;
    SELECT estado INTO v_estado FROM cotizacion WHERE id = v_id;
    IF v_estado IN ('EMITIDA','ANULADA') THEN
        RAISE EXCEPTION 'La cotización está % y sus resultados no se modifican', v_estado;
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER trg_linea_inmutable BEFORE INSERT OR UPDATE OR DELETE ON cotizacion_linea
    FOR EACH ROW EXECUTE FUNCTION fn_resultado_inmutable();
CREATE TRIGGER trg_total_inmutable BEFORE INSERT OR UPDATE OR DELETE ON cotizacion_total
    FOR EACH ROW EXECUTE FUNCTION fn_resultado_inmutable();

-- 6) Una cotización emitida solo puede pasar a ANULADA
CREATE FUNCTION fn_cotizacion_ciclo() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.estado = 'ANULADA' THEN
        RAISE EXCEPTION 'Una cotización anulada no cambia';
    END IF;
    IF OLD.estado = 'EMITIDA' AND NEW.estado NOT IN ('EMITIDA','ANULADA') THEN
        RAISE EXCEPTION 'Una cotización emitida solo puede anularse';
    END IF;
    IF OLD.estado = 'EMITIDA' AND NEW.estado = 'EMITIDA'
       AND (NEW.entrada::text <> OLD.entrada::text OR NEW.version_tarifa_id <> OLD.version_tarifa_id) THEN
        RAISE EXCEPTION 'Los datos de una cotización emitida no se modifican';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_cotizacion_ciclo BEFORE UPDATE ON cotizacion
    FOR EACH ROW EXECUTE FUNCTION fn_cotizacion_ciclo();

-- =====================================================================
-- Vistas de apoyo
-- =====================================================================

-- Versión de tarifas publicada y vigente hoy
CREATE VIEW v_version_vigente AS
SELECT * FROM version_tarifa
 WHERE estado = 'PUBLICADA'
   AND vigente_desde <= current_date
   AND (vigente_hasta IS NULL OR vigente_hasta > current_date);

-- Tarifas legibles, para administración y conciliación
CREATE VIEW v_tarifa_detalle AS
SELECT t.version_id, v.nombre AS version, pr.codigo AS producto, p.codigo AS plan,
       r.codigo AS region, t.sexo, t.edad_desde, t.edad_hasta, t.prima, t.periodicidad, t.disponible
  FROM tarifa t
  JOIN version_tarifa v ON v.id = t.version_id
  JOIN plan p           ON p.id = t.plan_id
  JOIN producto pr      ON pr.id = p.producto_id
  LEFT JOIN region r    ON r.id = t.region_id;

-- Parámetros vigentes hoy
CREATE VIEW v_parametro_vigente AS
SELECT pa.clave, pr.codigo AS producto, pl.codigo AS plan, pa.valor, pa.tipo, pa.vigente_desde, pa.vigente_hasta
  FROM parametro pa
  LEFT JOIN producto pr ON pr.id = pa.producto_id
  LEFT JOIN plan pl     ON pl.id = pa.plan_id
 WHERE pa.vigente_desde <= current_date
   AND (pa.vigente_hasta IS NULL OR pa.vigente_hasta > current_date);

COMMIT;
