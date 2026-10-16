export interface Version {
  id: string; nombre: string; estado: 'BORRADOR' | 'EN_REVISION' | 'PUBLICADA' | 'ARCHIVADA'; vigenteDesde: string; vigenteHasta: string | null;
  respaldoDocumental: string | null; creadoPor: string | null; aprobadoPor: string | null; tarifas: number;
}
const ESTADO: Record<Version['estado'], string> = { BORRADOR: 'Borrador', EN_REVISION: 'En revisión', PUBLICADA: 'Publicada', ARCHIVADA: 'Archivada' };
const CLASE: Record<Version['estado'], string> = { BORRADOR: 'CALCULADA', EN_REVISION: 'CALCULADA', PUBLICADA: 'OK', ARCHIVADA: 'ANULADA' };
export { ESTADO, CLASE };
