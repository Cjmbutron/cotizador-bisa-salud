import { Module } from '@nestjs/common';
import { TarifasService } from './tarifas.service';

@Module({ providers: [TarifasService], exports: [TarifasService] })
export class TarifasModule {}
