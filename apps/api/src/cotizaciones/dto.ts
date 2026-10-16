import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

const regional = z.enum(['LPZ', 'CBBA', 'SCZ', 'CHQ', 'TJA']);
const producto = z.enum(['IG', 'RM', 'AD', 'MB', 'NP']);

/** Solo forma y tipos. Las reglas de negocio (edades, topes, combinaciones) las valida el motor. */
export const entradaSchema = z
  .object({
    regional,
    aplicaSars: z.boolean(),
    productos: z.array(producto).min(1).max(5),
    asegurados: z
      .array(
        z
          .object({
            parentesco: z.enum(['TITULAR', 'CONYUGE', 'DEPENDIENTE']),
            edad: z.number().int(),
            sexo: z.enum(['MASCULINO', 'FEMENINO_SIN_MATERNIDAD', 'FEMENINO_CON_MATERNIDAD']),
            productoElegido: producto.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    redMax: z.object({ plan: z.enum(['RM_700K', 'RM_140K', 'RM_70K']) }).strict().optional(),
    mundialBlue: z
      .object({
        cobertura: z.enum(['1MM', '2MM', '5MM']),
        deducible: z.enum(['1K', '2K', '3K', '5K', '10K', '20K']),
        numeroHijos: z.number().int().optional(),
      })
      .strict()
      .optional(),
    naranjaPlus: z
      .object({ ambito: z.enum(['BOLIVIA', 'MUNDIAL_CON_BOLIVIA']), valorAsegurado: z.string().max(10), deducible: z.string().max(10) })
      .strict()
      .optional(),
  })
  .strict();

export const guardarSchema = z
  .object({ titularNombre: z.string().trim().min(1).max(120), entrada: entradaSchema })
  .strict();

export const anularSchema = z.object({ motivo: z.string().trim().min(5).max(300) }).strict();

export const listarSchema = z.object({
  estado: z.enum(['CALCULADA', 'EMITIDA', 'ANULADA']).optional(),
  q: z.string().trim().max(120).optional(),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limite: z.coerce.number().int().min(1).max(100).default(25),
  desplazamiento: z.coerce.number().int().min(0).default(0),
});

export function leer<T extends z.ZodTypeAny>(schema: T, datos: unknown): z.infer<T> {
  const r = schema.safeParse(datos);
  if (!r.success) {
    throw new BadRequestException({
      mensaje: 'Datos con formato inválido',
      detalle: r.error.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })),
    });
  }
  return r.data;
}
