import { Inject, Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { chromium } from 'playwright-core';
import type { Browser } from 'playwright-core';
import { CONFIG } from '../config/config';
import type { Config } from '../config/config';

const ANCHO_UTIL_PX = (8.5 - 0.7) * 96; // Carta, márgenes laterales de 0,35"
const MAX_SIMULTANEOS = 2;

function escapar(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Convierte HTML en PDF con Chromium (un navegador compartido; páginas con tope de simultaneidad). */
@Injectable()
export class PdfService implements OnModuleDestroy {
  private navegador?: Promise<Browser>;
  private activos = 0;
  private cola: (() => void)[] = [];

  constructor(@Inject(CONFIG) private readonly config: Config) {}

  private async opcionesDeLanzamiento() {
    if (this.config.PDF_MODO === 'serverless') {
      // @sparticuz/chromium es solo ESM: import() nativo, sin que TypeScript lo convierta en require().
      const importar = new Function('m', 'return import(m)') as (m: string) => Promise<{ default: { args: string[]; executablePath(): Promise<string> } }>;
      const { default: liviano } = await importar('@sparticuz/chromium');
      return { executablePath: await liviano.executablePath(), args: liviano.args, headless: true };
    }
    return {
      executablePath: this.config.CHROMIUM_PATH,
      args: this.config.CHROMIUM_SIN_SANDBOX ? ['--no-sandbox', '--disable-dev-shm-usage'] : ['--disable-dev-shm-usage'],
    };
  }

  private lanzar(): Promise<Browser> {
    if (!this.navegador) {
      this.navegador = this.opcionesDeLanzamiento()
        .then((o) => chromium.launch(o))
        .then((b) => {
          b.on('disconnected', () => { this.navegador = undefined; });
          return b;
        })
        .catch((e: unknown) => {
          this.navegador = undefined;
          throw new ServiceUnavailableException({
            mensaje: 'No se pudo iniciar el generador de PDF (Chromium no disponible)',
            codigo: 'PDF_NO_DISPONIBLE',
            detalle: e instanceof Error ? e.message.split('\n')[0] : String(e),
          });
        });
    }
    return this.navegador;
  }

  private async turno<T>(f: () => Promise<T>): Promise<T> {
    if (this.activos >= MAX_SIMULTANEOS) await new Promise<void>((ok) => this.cola.push(ok));
    this.activos++;
    try { return await f(); } finally {
      this.activos--;
      this.cola.shift()?.();
    }
  }

  /** @param pie texto del pie de página (se agrega "Página x de y") */
  async generar(html: string, anchoPx: number, pie: string): Promise<Buffer> {
    return this.turno(async () => {
      const nav = await this.lanzar();
      const pagina = await nav.newPage();
      try {
        await pagina.setContent(html, { waitUntil: 'load' });
        const escala = Math.max(0.1, Math.min(1, ANCHO_UTIL_PX / anchoPx));
        const pdf = await pagina.pdf({
          format: 'Letter',
          printBackground: true,
          scale: escala,
          margin: { top: '0.4in', bottom: '0.6in', left: '0.35in', right: '0.35in' },
          displayHeaderFooter: true,
          headerTemplate: '<span></span>',
          footerTemplate: `<div style="width:100%;font:7pt 'Liberation Sans',Arial,sans-serif;color:#666;text-align:center">${escapar(pie)} · Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>`,
        });
        return Buffer.from(pdf);
      } finally {
        await pagina.close().catch(() => undefined);
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    const n = this.navegador;
    this.navegador = undefined;
    if (n) await (await n).close().catch(() => undefined);
  }
}
