import { Module } from '@nestjs/common';
import { TarifasModule } from '../tarifas/tarifas.module';
import { TarifasAdminController } from './tarifas-admin.controller';
import { TarifasAdminService } from './tarifas-admin.service';

@Module({ imports: [TarifasModule], controllers: [TarifasAdminController], providers: [TarifasAdminService] })
export class AdminModule {}
