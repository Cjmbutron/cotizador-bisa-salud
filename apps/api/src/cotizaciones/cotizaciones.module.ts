import { Module } from '@nestjs/common';
import { TarifasModule } from '../tarifas/tarifas.module';
import { CotizacionesController } from './cotizaciones.controller';
import { CotizacionesService } from './cotizaciones.service';

@Module({ imports: [TarifasModule], controllers: [CotizacionesController], providers: [CotizacionesService], exports: [CotizacionesService] })
export class CotizacionesModule {}
