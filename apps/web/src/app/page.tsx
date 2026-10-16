'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { api, leerToken } from '@/lib/api';
import type { Yo } from '@/lib/yo';

/** Lleva a cada persona a su pantalla de trabajo según su rol. */
export default function Inicio() {
  const router = useRouter();
  useEffect(() => {
    if (!leerToken()) { router.replace('/login'); return; }
    api<Yo>('/me').then((yo) => {
      const r = yo.roles;
      router.replace(r.includes('COMERCIAL') ? '/cotizar' : r.some((x) => x.endsWith('_TARIFAS')) ? '/admin/tarifas' : '/cotizaciones');
    }).catch(() => undefined);
  }, [router]);
  return null;
}
