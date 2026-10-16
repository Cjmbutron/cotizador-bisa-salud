import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Cotizador BISA Salud', description: 'Cotizador interno de seguros de salud' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
