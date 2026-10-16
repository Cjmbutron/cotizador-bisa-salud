'use client';
import { createContext, useContext } from 'react';

export interface Yo { email: string; nombre: string; roles: string[] }
export const YoContext = createContext<Yo | null>(null);
export const useYo = () => useContext(YoContext)!;
export const tieneRol = (yo: Yo, ...r: string[]) => r.some((x) => yo.roles.includes(x));
export const ROLES_PLANTILLAS = ['REVISOR_COMERCIAL', 'ADMIN_TI', 'AUDITOR'];
export const ROLES_ADMIN = ['ADMIN_TARIFAS', 'APROBADOR_TARIFAS', 'AUDITOR'];
