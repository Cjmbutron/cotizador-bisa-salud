import type { Asegurado, Parametros, SexoTarifa } from './tipos.js';

export const esAdultoMB = (a: Asegurado, p: Parametros): boolean =>
  a.edad >= (a.parentesco === 'DEPENDIENTE' ? p.mbEdadAdulto.dependiente : p.mbEdadAdulto.titularConyuge);

export const conMaternidad = (a: Asegurado): boolean => a.sexo === 'FEMENINO_CON_MATERNIDAD';

export const sexoTarifa = (a: Asegurado): SexoTarifa =>
  a.sexo === 'MASCULINO' ? 'M' : a.sexo === 'FEMENINO_SIN_MATERNIDAD' ? 'F' : 'F-M';
