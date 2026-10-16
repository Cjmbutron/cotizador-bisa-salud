M,FSM,FCM='MASCULINO','FEMENINO SIN MATERNIDAD','FEMENINO CON MATERNIDAD'
T,C,D='TITULAR','CONYUGE','HIJ@'
REG=['LA PAZ','COCHABAMBA','SANTA CRUZ','CHUQUISACA','TARIJA']
COV={'1MM':'USD 1.000.000.-','2MM':'USD 2.000.000.-','5MM':'USD 5.000.000.-'}
DED={'1K':'USD 1.000.-','2K':'USD 2.000.-','3K':'USD 3.000.-','5K':'USD 5.000.-','10K':'USD 10.000.-','20K':'USD 20.000.-'}
NPV={'50K':'USD 50.000.-','100K':'USD 100.000.-','150K':'USD 150.000.-','250K':'USD 250.000.-','500K':'USD 500.000.-','1MM':'USD 1.000.000.-'}
NPD={'5K':'USD 5.000.-','10K':'USD 10.000.-','50K':'USD 50.000.-','100K':'USD 100.000.-'}
RMP=['Bs. 700.000.-','Bs. 140.000.-','Bs. 70.000.-']
def base(**k):
    d={'C9':'LA PAZ','C11':'NO','C13':'ADVANCE','D13':'RED MAX','E13':'INFINITY GREEN','F13':'MUNDIAL BLUE',
       'M7':COV['1MM'],'M9':DED['5K'],'M11':1,'U7':'MUNDIAL INCLUYENDO BOLIVIA','U9':NPV['1MM'],'U11':NPD['10K'],'U13':RMP[0]}
    d.update(k); return d
ESC=[]
# --- Mundial Blue: 18 combinaciones
PMB=[(T,17,M),(C,18,FSM),(D,24,M),(D,25,FSM),(D,40,M),(D,74,FSM),(D,75,M)]
i=0
for cov in COV:
    for ded in DED:
        ESC.append((f'MB_{cov}_{ded}', base(M7=COV[cov],M9=DED[ded],M11=(i%5)+1,C9=REG[i%5]), PMB)); i+=1
# --- Naranja+: 22 combinaciones
PNP=[(T,19,FCM),(C,18,FCM),(D,0,M),(D,1,FSM),(D,30,M),(D,64,FSM),(D,65,M)]
for va in ('50K','100K','250K'):
    for ded in ('5K','10K'):
        ESC.append((f'NP_L_{va}_{ded}', base(U7='BOLIVIA',U9=NPV[va],U11=NPD[ded]), PNP))
for va in ('150K','250K','500K','1MM'):
    for ded in ('5K','10K','50K','100K'):
        ESC.append((f'NP_MB_{va}_{ded}', base(U7='MUNDIAL INCLUYENDO BOLIVIA',U9=NPV[va],U11=NPD[ded]), PNP))
# --- Infinity / Red Max / Advance
A=[(T,19,FCM),(C,49,FCM),(D,0,M),(D,64,FSM),(D,65,M),(D,33,FSM),(D,47,M)]
B=[(T,25,FCM),(C,35,FCM),(D,1,FSM),(D,12,M),(D,58,FSM),(D,61,M),(D,22,FSM)]
Cc=[(T,18,FCM),(C,50,FCM),(D,9,M),(D,29,FSM),(D,44,M),(D,52,FSM),(D,63,M)]
i=0
for r in REG:
    for sars in ('NO','SI'):
        ESC.append((f'IGR_{r.replace(" ","")}_{sars}', base(C9=r,C11=sars,U13=RMP[i%3]), A if i%2==0 else B)); i+=1
ESC.append(('IGR_BORDE_LPZ', base(C9='LA PAZ',U13=RMP[1]), Cc))
ESC.append(('IGR_BORDE_SCZ', base(C9='SANTA CRUZ',C11='SI',U13=RMP[2]), Cc))
# --- Defecto del Excel: SARS = SI con asegurados sin tarifa en Infinity
ESC.append(('IGR_SARS_FUERA_RANGO', base(C9='LA PAZ',C11='SI'), [(T,65,M),(C,70,FSM),(D,64,M),(D,80,FSM),(D,30,M),(D,99,M),(D,0,FSM)]))
