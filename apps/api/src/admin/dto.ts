import { z } from 'zod';

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'formato AAAA-MM-DD');

export const crearVersionSchema = z
  .object({
    nombre: z.string().trim().min(3).max(80),
    vigenteDesde: fecha,
    respaldoDocumental: z.string().trim().min(3).max(1000),
    /** Versión de la que se copian todas las tarifas para partir de ellas. */
    copiarDe: z.string().uuid().optional(),
  })
  .strict();

export const filaTarifaSchema = z
  .object({
    plan: z.string().max(40),
    region: z.enum(['LPZ', 'CBBA', 'SCZ', 'CHQ', 'TJA']).optional(),
    sexo: z.enum(['M', 'F', 'F-M']).optional(),
    edad: z.number().int().min(0).max(99),
    /** null = "N/A" (sin tarifa para esa edad). */
    prima: z.number().min(0).max(1_000_000).nullable(),
  })
  .strict();

export const tarifasSchema = z.object({ filas: z.array(filaTarifaSchema).min(1).max(8000) }).strict();

export const hijosSchema = z
  .object({
    filas: z
      .array(z.object({ plan: z.string().max(40), numeroHijos: z.number().int().min(1).max(5), primaPorHijo: z.number().min(0).max(1_000_000) }).strict())
      .min(1).max(200),
  })
  .strict();

export const devolverSchema = z.object({ motivo: z.string().trim().min(5).max(300) }).strict();

export const parametroSchema = z
  .object({
    clave: z.string().trim().min(1).max(60),
    producto: z.enum(['IG', 'RM', 'AD', 'MB', 'NP']).optional(),
    plan: z.string().max(40).optional(),
    valor: z.number(),
    vigenteDesde: fecha,
    motivo: z.string().trim().min(5).max(300),
  })
  .strict();
