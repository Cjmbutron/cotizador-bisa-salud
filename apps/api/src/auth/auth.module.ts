import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { VerificadorToken } from './verificador';

@Global()
@Module({ providers: [VerificadorToken, { provide: APP_GUARD, useClass: AuthGuard }], exports: [VerificadorToken] })
export class AuthModule {}
