'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, cerrarSesion, leerToken } from '@/lib/api';
import { ROLES_ADMIN, ROLES_PLANTILLAS, tieneRol, Yo, YoContext } from '@/lib/yo';

/** Marco común: exige sesión y muestra la navegación. */
export default function Shell({ children, ancho = false }: { children: React.ReactNode; ancho?: boolean }) {
  const [yo, setYo] = useState<Yo | null>(null);
  useEffect(() => {
    if (!leerToken()) { window.location.href = '/login'; return; }
    api<Yo>('/me').then(setYo).catch(() => undefined);
  }, []);
  if (!yo) return null;
  return (
    <YoContext.Provider value={yo}>
      <header className="barra">
        <strong>Cotizador BISA Salud</strong>
        <nav aria-label="Principal">
          {tieneRol(yo, 'COMERCIAL') && <Link href="/cotizar">Nueva cotización</Link>}
          {tieneRol(yo, 'COMERCIAL', 'SUPERVISOR', 'AUDITOR') && <Link href="/cotizaciones">Cotizaciones</Link>}
          {tieneRol(yo, ...ROLES_ADMIN) && <Link href="/admin/tarifas">Tarifas</Link>}
          {tieneRol(yo, ...ROLES_ADMIN) && <Link href="/admin/parametros">Parámetros</Link>}
          {tieneRol(yo, ...ROLES_PLANTILLAS) && <Link href="/admin/plantillas">Plantillas</Link>}
        </nav>
        <span className="quien">{yo.email}</span>
        <button onClick={cerrarSesion}>Salir</button>
      </header>
      <main className={ancho ? 'ancho' : undefined}>{children}</main>
    </YoContext.Provider>
  );
}
