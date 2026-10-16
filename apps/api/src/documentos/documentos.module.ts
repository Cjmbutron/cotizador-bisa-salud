import { Module } from '@nestjs/common';
import { CotizacionesModule } from '../cotizaciones/cotizaciones.module';
import { DocumentosController } from './documentos.controller';
import { DocumentosService } from './documentos.service';
import { PdfService } from './pdf.service';

@Module({ imports: [CotizacionesModule], controllers: [DocumentosController], providers: [DocumentosService, PdfService] })
export class DocumentosModule {}
