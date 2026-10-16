import { Controller, Get } from '@nestjs/common';
import { UsuarioActual } from '../auth/auth.tipos';
import { Usuario } from '../auth/decoradores';

@Controller('me')
export class MeController {
  /** Quién es el usuario y qué roles tiene, para que la pantalla muestre solo lo que le corresponde (la API igual lo vuelve a exigir). */
  @Get()
  yo(@Usuario() u: UsuarioActual) {
    return { email: u.email, nombre: u.nombre, roles: u.roles };
  }
}
