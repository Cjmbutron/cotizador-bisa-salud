import { SignJWT } from 'jose';

/**
 * SOLO DESARROLLO: entrega un token para el correo indicado. Devuelve 404 si AUTH_MODE no es "dev" o si NODE_ENV es production.
 * En producción el inicio de sesión lo hace el proveedor de identidad corporativo (pendiente con TI).
 */
export async function GET(req: Request) {
  const secreto = process.env.AUTH_DEV_SECRET;
  if (process.env.AUTH_MODE !== 'dev' || process.env.NODE_ENV === 'production' || !secreto || secreto.length < 32) {
    return new Response('No encontrado', { status: 404 });
  }
  const email = new URL(req.url).searchParams.get('email')?.trim().toLowerCase();
  if (!email || !email.includes('@')) return Response.json({ mensaje: 'Indique un correo' }, { status: 400 });
  const token = await new SignJWT({ email }).setProtectedHeader({ alg: 'HS256' }).setIssuer('cotizador-dev').setIssuedAt().setExpirationTime('8h').sign(new TextEncoder().encode(secreto));
  return Response.json({ token });
}
