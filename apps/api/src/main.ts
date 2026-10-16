import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { crearApp } from './app';
import { cargarConfig } from './config/config';

async function arrancar() {
  const config = cargarConfig();
  const app = await crearApp(config);
  await app.listen(config.PORT);
  new Logger('Arranque').log(`API escuchando en el puerto ${config.PORT} (auth: ${config.AUTH_MODE})`);
}
arrancar().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
