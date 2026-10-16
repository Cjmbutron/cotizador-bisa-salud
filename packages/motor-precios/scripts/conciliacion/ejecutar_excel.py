import sys, os, json, time, warnings
warnings.filterwarnings('ignore')
sys.path.insert(0,'/tmp/sc'); sys.path.insert(0,'/tmp/c3')
import run as R
from concurrent.futures import ThreadPoolExecutor
from esc import ESC
R.BASE='/tmp/sc/base.xlsx'
def one(item):
    name,edits,people=item
    out=f'/tmp/c3/res/{name}.json'
    if os.path.exists(out): return name,'ya'
    try:
        # salida del xlsx recalculado en otra carpeta para no pisar
        r=R.run(name,edits,[tuple(p) for p in people])
        json.dump(r,open(out,'w'),ensure_ascii=False,default=str); return name,'ok'
    except Exception as e:
        return name,'ERR '+str(e)[:80]
t=time.time(); lim=float(sys.argv[1]); pend=[x for x in ESC if not os.path.exists(f'/tmp/c3/res/{x[0]}.json')]
print('pendientes',len(pend),flush=True)
done=0
with ThreadPoolExecutor(3) as ex:
    futs=[]
    for it in pend:
        futs.append(ex.submit(one,it))
    for f in futs:
        try:
            n,s=f.result(timeout=max(1,lim-(time.time()-t))); done+=1
        except Exception as e:
            break
        if time.time()-t>lim: 
            for g in futs: g.cancel()
            break
print('hechos en esta pasada',done,'segundos',int(time.time()-t))
