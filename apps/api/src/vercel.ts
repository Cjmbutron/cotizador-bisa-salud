import 'reflect-metadata';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { crearApp } from './app';
import { cargarConfig } from './config/config';

/**
 * Entrada para Vercel (funciones serverless). Se crea la aplicación una sola vez por instancia en caliente
 * y se reutiliza; cada petición pasa por el mismo Express de Nest.
 */
let lista: Promise<(req: IncomingMessage, res: ServerResponse) => void> | undefined;

function iniciar() {
  return (async () => {
    const app = await crearApp(cargarConfig());
    await app.init();
    return app.getHttpAdapter().getInstance() as (req: IncomingMessage, res: ServerResponse) => void;
  })().catch((e) => { lista = undefined; throw e; });
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    lista ??= iniciar();
    (await lista)(req, res);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ mensaje: 'El servicio no está disponible' }));
  }
}
