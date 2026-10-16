'use client';
import { useState } from 'react';
import { guardarToken } from '@/lib/api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  // Con proveedor de identidad (Supabase Auth) se pide contraseña; sin él, solo existe el acceso de desarrollo.
  const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault(); setError(''); setCargando(true);
    try {
      let token: string;
      if (SUPA && SUPA_KEY) {
        const r = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPA_KEY },
          body: JSON.stringify({ email: email.trim(), password: clave }),
        });
        if (r.status === 400 || r.status === 401) { setError('Correo o contraseña incorrectos.'); return; }
        if (!r.ok) { setError('No se pudo iniciar sesión.'); return; }
        token = (await r.json()).access_token;
      } else {
        const r = await fetch(`/dev-token?email=${encodeURIComponent(email)}`);
        if (r.status === 404) { setError('El inicio de sesión corporativo aún no está configurado en este ambiente.'); return; }
        if (!r.ok) { setError('No se pudo iniciar sesión.'); return; }
        token = (await r.json()).token;
      }
      // Comprueba que la API lo acepta (usuario registrado y activo) antes de entrar.
      const t = await fetch('/api/catalogo', { headers: { Authorization: `Bearer ${token}` } });
      if (t.status === 403) { setError('Su usuario no tiene acceso al sistema. Solicítelo a TI.'); return; }
      if (!t.ok) { setError('La API no respondió correctamente.'); return; }
      guardarToken(token);
      window.location.href = '/';
    } finally { setCargando(false); }
  }

  return (
    <main style={{ maxWidth: 420 }}>
      <h1>Cotizador BISA Salud</h1>
      <p className="sub">Ingrese con su correo institucional.</p>
      <form className="tarjeta" onSubmit={entrar}>
        <label htmlFor="correo">Correo</label>
        <input id="correo" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        {SUPA && SUPA_KEY && (<>
          <label htmlFor="clave">Contraseña</label>
          <input id="clave" type="password" autoComplete="current-password" required value={clave} onChange={(e) => setClave(e.target.value)} />
        </>)}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="acciones"><span /><button className="primario" disabled={cargando}>Entrar</button></div>
      </form>
    </main>
  );
}
