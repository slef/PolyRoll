import itertools, math, random
import numpy as np
from tame2 import compose, inverse, cycles, conj, orbits_count, power, nc_transitive
random.seed(1)
CELLS={"(2,4,4)":((2,4,4),{'C':(0,0),'A':(1,0),'B':(0,1)}),
       "(2,3,6)":((2,3,6),{'C':(0,0),'A':(1,0),'B':(0,math.sqrt(3))}),
       "(3,3,3)":((3,3,3),{'C':(0,0),'A':(1,0),'B':(0.5,math.sqrt(3)/2)})}
EDGES={'AB':('A','B'),'BC':('B','C'),'CA':('C','A')}
def reflect(p,a,b):
    p,a,b=map(np.array,(p,a,b)); d=b-a; d=d/np.linalg.norm(d); v=p-a
    return a+2*np.dot(v,d)*d-v
def enumerate_rows(K,name):
    (kC,kA,kB),_=CELLS[name]
    perms=list(itertools.permutations(range(K))); idp=tuple(range(K))
    invols=[p for p in perms if compose(p,p)==idp]
    seen=set(); rows=[]
    for s in perms:
        for t in perms:
            sA=compose(inverse(t),s); sB=inverse(s); sC=t
            if any(len(c)>k for p,k in ((sA,kA),(sB,kB),(sC,kC)) for c in cycles(p)): continue
            if orbits_count([s,t],K)!=1: continue
            if not nc_transitive([s,t],[power(sA,kA),power(sB,kB),power(sC,kC)],K): continue
            can=min((conj(s,g),conj(t,g)) for g in perms)
            if can in seen: continue
            alts={can}; fr=[can]
            while fr:
                a,b=fr.pop()
                cand=[(inverse(a),inverse(b))]
                if name=="(2,4,4)": cand.append((compose(a,inverse(b)),inverse(b)))
                if name=="(3,3,3)":
                    cand.append((compose(a,inverse(b)),inverse(b)))
                    cand.append((inverse(a),compose(b,inverse(a))))
                for c in cand:
                    c=min((conj(c[0],g),conj(c[1],g)) for g in perms)
                    if c not in alts: alts.add(c);fr.append(c)
            seen|=alts
            s,t=can
            sA=compose(inverse(t),s); sB=inverse(s); sC=t
            cones=[]
            for lab,p,k in (('A',sA,kA),('B',sB,kB),('C',sC,kC)):
                for c in cycles(p): cones.append((lab,frozenset(c),360*len(c)//k))
            pi_found=None
            for pi in invols:
                if compose(compose(s,pi),compose(s,pi))!=idp: continue
                if compose(compose(t,pi),compose(t,pi))!=idp: continue
                fAB={i for i in range(K) if s[i]==pi[i]}; fCA={i for i in range(K) if t[i]==pi[i]}; fBC={i for i in range(K) if pi[i]==i}
                ok=True
                for lab,S,a in cones:
                    if a>=360: continue
                    hit = S&(fAB|fCA) if lab=='A' else S&(fAB|fBC) if lab=='B' else S&(fCA|fBC)
                    if not hit: ok=False;break
                if ok and (fAB|fCA|fBC): pi_found=pi;break
            rows.append(dict(K=K,cell=name,s=s,t=t,cones=cones,pi=pi_found))
    return rows
def g_of(row,e):
    s,t=row['s'],row['t']
    return {'BC':tuple(range(row['K'])),'AB':s,'CA':t}[e]
def cone_of(row,kind,i,lab):
    # cone class of corner lab of triangle (kind,i)
    if kind=='F': j=i
    else:
        j = i if lab in 'BC' else inverse(row['t'])[i]
    for c in row['cones']:
        if c[0]==lab and j in c[1]: return c
def develop(row, tris, adj, start):
    # tris: list of (kind,i); adj(tri,e)->neighbor or None. BFS tree development.
    _,base=CELLS[row['cell']]
    pos={}
    k0=start
    pts={L:np.array(base[L],float) for L in 'ABC'}
    if k0[0]=='B': pts={L:np.array([v[0],-v[1]]) for L,v in pts.items()}
    pos[k0]=pts
    order=[k0]; q=[k0]
    while q:
        cur=q.pop(0 if random.random()<0.5 else -1)
        es=list(EDGES); random.shuffle(es)
        for e in es:
            nb=adj(cur,e)
            if nb is None or nb in pos: continue
            a,b=EDGES[e]; third=[x for x in 'ABC' if x not in (a,b)][0]
            P=pos[cur]
            pos[nb]={a:P[a],b:P[b],third:reflect(P[third],P[a],P[b])}
            q.append(nb); order.append(nb)
    return pos
def tri_overlap(T1,T2):
    # shrink slightly then SAT test
    def shrink(T):
        c=sum(T)/3; return [c+(p-c)*0.98 for p in T]
    A=shrink(T1);B=shrink(T2)
    for T in (A,B):
        for i in range(3):
            p,q=T[i],T[(i+1)%3]; n=np.array([-(q-p)[1],(q-p)[0]])
            pa=[np.dot(n,x) for x in A]; pb=[np.dot(n,x) for x in B]
            if max(pa)<=min(pb) or max(pb)<=min(pa): return False
    return True
def net(row):
    K=row['K']; tris=[('F',i) for i in range(K)]+[('B',i) for i in range(K)]
    def adj(tri,e):
        kind,i=tri; g=g_of(row,e)
        return ('B',g[i]) if kind=='F' else ('F',inverse(g)[i])
    best=None
    for trial in range(400):
        pos=develop(row,tris,adj,random.choice(tris))
        if len(pos)<2*K: continue
        ok=True
        items=list(pos.items())
        for a in range(len(items)):
            for b in range(a+1,len(items)):
                if tri_overlap([items[a][1][L] for L in 'ABC'],[items[b][1][L] for L in 'ABC']): ok=False;break
            if not ok: break
        if ok: return pos
    return None
def polygon(row):
    K=row['K']; pi=row['pi']
    def adj(tri,e):
        kind,i=tri; j=pi[g_of(row,e)[i]]
        return None if j==i else ('F',j)
    pos=develop(row,[('F',i) for i in range(K)],adj,('F',0))
    assert len(pos)==K
    # boundary segments
    segs=[]
    for (kind,i),P in pos.items():
        for e,(a,b) in EDGES.items():
            if pi[g_of(row,e)[i]]==i: segs.append((tuple(P[a]),tuple(P[b]),cone_of(row,'F',i,a),cone_of(row,'F',i,b)))
    return pos,segs
def svg_shape(row,ox,oy,size):
    K=row['K']; out=[]
    if row['pi'] is not None:
        pos,segs=polygon(row)
        pts=[np.array(p) for P in pos.values() for p in P.values()]
    else:
        pos=net(row)
        if pos is None: return f'<text class="ts" x="{ox}" y="{oy}">net search failed</text>'
        pts=[np.array(p) for P in pos.values() for p in P.values()]
    mn=np.min(pts,axis=0); mx=np.max(pts,axis=0); span=max(mx-mn); sc=(size-30)/span
    def tr(p): p=np.array(p); return (ox+15+(p[0]-mn[0])*sc, oy+size-15-(p[1]-mn[1])*sc)
    for (kind,i),P in pos.items():
        poly=" ".join(f"{x:.1f},{y:.1f}" for x,y in (tr(P[L]) for L in 'ABC'))
        cls="c-teal" if kind=='F' else "c-purple"
        out.append(f'<g class="{cls}"><polygon points="{poly}" stroke-width="0.8" stroke-opacity="0.5"/></g>')
    if row['pi'] is not None:
        for a,b,ca,cb in segs:
            (x1,y1),(x2,y2)=tr(a),tr(b)
            out.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="var(--t)" stroke-width="2"/>')
    # cone labels at unique positions
    labels={}
    for (kind,i),P in pos.items():
        for L in 'ABC':
            c=cone_of(row,kind,i,L)
            if c[2]>=360: continue
            key=(round(P[L][0],4),round(P[L][1],4))
            labels[key]=c[2]
    for (x,y),a in labels.items():
        X,Y=tr((x,y))
        out.append(f'<circle cx="{X:.1f}" cy="{Y:.1f}" r="2.5" fill="var(--t)"/><text class="ts" x="{X+4:.1f}" y="{Y-3:.1f}" font-size="9">{a}</text>')
    angs=sorted([c[2] for c in row['cones'] if c[2]<360],reverse=True)
    out.append(f'<text class="ts" x="{ox+size/2}" y="{oy+size+12}" text-anchor="middle" font-size="10">K={K} {row["cell"]} {",".join(map(str,angs))}</text>')
    return "\n".join(out)
if __name__=="__main__":
    deg=[];nondeg=[]
    for K in [2,3,4,5,6]:
        for name in CELLS:
            for r in enumerate_rows(K,name):
                (deg if r['pi'] is not None else nondeg).append(r)
    import json
    for title,rows,fn in (("Doubly covered polygons",deg,"degenerate.svg"),("Non-degenerate: unfoldings along cell edges",nondeg,"nondegenerate.svg")):
        size=150; cols=5
        n=len(rows); h=(n+cols-1)//cols*(size+30)+40
        parts=[f'<svg width="100%" viewBox="0 0 {cols*(size+20)+20} {h}" xmlns="http://www.w3.org/2000/svg">',f'<text class="th" x="10" y="22">{title}</text>']
        for idx,r in enumerate(rows):
            ox=10+(idx%cols)*(size+20); oy=40+(idx//cols)*(size+30)
            parts.append(svg_shape(r,ox,oy,size))
        parts.append('</svg>')
        open(fn,'w').write("\n".join(parts))
        print(fn,len(rows),"shapes")
