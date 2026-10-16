import { Inject, Injectable } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import { CONFIG, Config } from '../config/config';

/**
 * Valida el token y devuelve el correo del usuario. Es la ÚNICA pieza que depende del
 * proveedor de identidad: cambiar de proveedor (Entra ID, Keycloak, Okta...) es cambiar
 * variables de entorno. Los roles NO salen del token: salen de la base (usuario_rol).
 */
@Injectable()
export class VerificadorToken {
  private readonly jwks?: ReturnType<typeof createRemoteJWKSet>;
  private readonly secreto?: Uint8Array;

  constructor(@Inject(CONFIG) private readonly cfg: Config) {
    if (cfg.AUTH_MODE === 'oidc') this.jwks = createRemoteJWKSet(new URL(cfg.OIDC_JWKS_URI!));
    else this.secreto = new TextEncoder().encode(cfg.AUTH_DEV_SECRET!);
  }

  async correoDe(token: string): Promise<string> {
    let payload: JWTPayload;
    if (this.jwks) {
      ({ payload } = await jwtVerify(token, this.jwks, {
        issuer: this.cfg.OIDC_ISSUER,
        audience: this.cfg.OIDC_AUDIENCE,
        algorithms: ['RS256', 'ES256', 'PS256'],
      }));
    } else {
      ({ payload } = await jwtVerify(token, this.secreto!, { algorithms: ['HS256'], issuer: 'cotizador-dev' }));
    }
    const correo = payload[this.cfg.OIDC_EMAIL_CLAIM];
    if (typeof correo !== 'string' || !correo.includes('@')) throw new Error('El token no trae correo');
    return correo.toLowerCase();
  }
}
