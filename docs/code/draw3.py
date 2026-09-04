import pickle, math, random, string
import numpy as np
from shapely.geometry import Polygon
from alex import *
random.seed(5)
def merged_faces(X,tf):
    m=len(tf)
    def plane(f):
        a,b,c=[X[v] for v in f]; nrm=np.cross(b-a,c-a); nrm/=np.linalg.norm(nrm)
        return nrm,np.dot(nrm,a)
    pl=[plane(f) for f in tf]
    parent=list(range(m))
    def find(x):
        while parent[x]!=x: parent[x]=parent[parent[x]]; x=parent[x]
        return x
    for i in range(m):
        for j in range(i+1,m):
            if len(set(tf[i])&set(tf[j]))==2:
                ni,di=pl[i]; nj,dj=pl[j]
                if np.linalg.norm(ni-nj)<1e-6 and abs(di-dj)<1e-6: parent[find(i)]=find(j)
    groups={}
    for i in range(m): groups.setdefault(find(i),[]).append(i)
    out=[]
    for g in groups.values():
        de=set()
        for i in g:
            f=tf[i]
            for k in range(3):
                e=(f[k],f[(k+1)%3])
                if (e[1],e[0]) in de: de.discard((e[1],e[0]))
                else: de.add(e)
        nxt={u:v for u,v in de}
        start=next(iter(nxt)); cyc=[start]
        while nxt[cyc[-1]]!=start: cyc.append(nxt[cyc[-1]])
        out.append(cyc)
    return out
def unfold(X,polys,tries=800):
    m=len(polys); shared={}
    for i in range(m):
        for j in range(i+1,m):
            common=set(polys[i])&set(polys[j])
            if len(common)==2: shared[frozenset((i,j))]=tuple(common)
    def local2d(f):
        a=X[f[0]]; b=X[f[1]]
        e1=b-a; e1/=np.linalg.norm(e1); nrm=None
        for k in range(len(f)):
            u=X[f[(k+1)%len(f)]]-X[f[k]]; v=X[f[(k+2)%len(f)]]-X[f[(k+1)%len(f)]]
            c=np.cross(u,v)
            if np.linalg.norm(c)>1e-8: nrm=c/np.linalg.norm(c); break
        e2=np.cross(nrm,e1)
        return {vv:np.array([np.dot(X[vv]-a,e1),np.dot(X[vv]-a,e2)]) for vv in f}
    loc=[local2d(f) for f in polys]
    adjm={i:[] for i in range(m)}
    for k in shared:
        i,j=tuple(k); adjm[i].append(j); adjm[j].append(i)
    for t in range(tries):
        root=random.randrange(m)
        placed={root:{v:loc[root][v] for v in polys[root]}}
        tree=set(); q=[root]
        while q:
            cur=q.pop(random.randrange(len(q)))
            nb=adjm[cur][:]; random.shuffle(nb)
            for j in nb:
                if j in placed: continue
                u,v=shared[frozenset((cur,j))]
                P=placed[cur]; Lc=loc[j]
                d1=Lc[v]-Lc[u]; d2=P[v]-P[u]
                th=math.atan2(d2[1],d2[0])-math.atan2(d1[1],d1[0])
                R=np.array([[math.cos(th),-math.sin(th)],[math.sin(th),math.cos(th)]])
                tvec=P[u]-R@Lc[u]
                placed[j]={vv:R@Lc[vv]+tvec for vv in polys[j]}
                tree.add(frozenset((cur,j))); q.append(j)
        shapes={i:Polygon([tuple(placed[i][v]) for v in polys[i]]).buffer(-1e-6) for i in placed}
        ok=True; ks=list(shapes)
        for a in range(len(ks)):
            for b in range(a+1,len(ks)):
                if shapes[ks[a]].intersects(shapes[ks[b]]): ok=False;break
            if not ok: break
        if ok: return placed,tree
    return None,None
def svg_case(idx,ox,oy,size):
    r,T,faces,X,tf=pickle.load(open(f'sol_{idx}.pkl','rb'))
    S=Surface(r)
    polys=merged_faces(X,tf)
    placed,tree=unfold(X,polys)
    if placed is None: return f'<text class="ts" x="{ox}" y="{oy+20}">case {idx}: unfold failed</text>'
    pts=[p for P in placed.values() for p in P.values()]
    mn=np.min(pts,axis=0); mx=np.max(pts,axis=0); span=max(mx-mn); sc=(size-56)/span
    def tr(p): return np.array((ox+28+(p[0]-mn[0])*sc, oy+size-28-(p[1]-mn[1])*sc))
    out=[]
    for i,P in placed.items():
        poly=" ".join(f"{x:.1f},{y:.1f}" for x,y in (tr(P[v]) for v in polys[i]))
        out.append(f'<g class="c-teal"><polygon points="{poly}" stroke-width="1"/></g>')
    # cut edges: an edge occurrence is cut unless the neighbor across it is joined in tree
    occ={}
    for i,P in placed.items():
        f=polys[i]
        for k in range(len(f)):
            u,v=f[k],f[(k+1)%len(f)]
            joined=any(frozenset((i,j)) in tree and {u,v}<=set(polys[j]) for j in placed if j!=i)
            if not joined: occ.setdefault(frozenset((u,v)),[]).append((i,u,v))
    letters=iter(string.ascii_lowercase)
    for key,lst in occ.items():
        L=next(letters)
        umin=min(tuple(key))
        for oi,(i,u,v) in enumerate(lst):
            P=placed[i]; p1,p2=tr(P[u]),tr(P[v])
            cen=tr(sum(P[vv] for vv in polys[i])/len(polys[i]))
            mmid=(p1+p2)/2; nvec=mmid-cen
            if np.linalg.norm(nvec)<1e-9: nvec=np.array([0,-1.0])
            nvec/=np.linalg.norm(nvec)
            out.append(f'<line x1="{p1[0]:.1f}" y1="{p1[1]:.1f}" x2="{p2[0]:.1f}" y2="{p2[1]:.1f}" stroke="var(--t)" stroke-width="2"/>')
            lab=L+("&#772;" if oi==1 else "")
            out.append(f'<text class="ts" x="{mmid[0]+9*nvec[0]:.1f}" y="{mmid[1]+9*nvec[1]+3:.1f}" text-anchor="middle" font-size="10" font-style="italic">{lab}</text>')
            pd=tr(P[umin])+ (tr(P[u if u!=umin else v])-tr(P[umin]))*0.22
            out.append(f'<circle cx="{pd[0]:.1f}" cy="{pd[1]:.1f}" r="1.8" fill="var(--t)"/>')
    labels={}
    for i,P in placed.items():
        for v in polys[i]:
            keyp=(round(float(P[v][0]),4),round(float(P[v][1]),4))
            labels[keyp]=v+1
    for (x,y),a in labels.items():
        Xp,Yp=tr((x,y))
        out.append(f'<circle cx="{Xp:.1f}" cy="{Yp:.1f}" r="7" fill="var(--bg,white)" stroke="var(--t)" stroke-width="0.8"/><text class="ts" x="{Xp:.1f}" y="{Yp+3.5:.1f}" text-anchor="middle" font-size="9" font-weight="bold">{a}</text>')
    leg=", ".join(f"{k+1}:{c[2]}&#176;" for k,c in enumerate(S.cones))
    fc=len(polys)
    out.append(f'<text class="ts" x="{ox+size/2}" y="{oy+size+12}" text-anchor="middle" font-size="11">K={r["K"]} cell {r["cell"]} &#183; {fc} faces</text>')
    out.append(f'<text class="ts" x="{ox+size/2}" y="{oy+size+26}" text-anchor="middle" font-size="10">{leg}</text>')
    return "\n".join(out)
size=300; cols=3
parts=[f'<svg width="100%" viewBox="0 0 {cols*(size+20)+20} {4*(size+45)+50}" xmlns="http://www.w3.org/2000/svg">','<text class="th" x="10" y="22">Edge unfoldings (true faces). Glue x to x&#772; (dot = endpoint at the smaller-numbered vertex); circled numbers = vertices.</text>']
for idx in range(12):
    ox=10+(idx%cols)*(size+20); oy=45+(idx//cols)*(size+45)
    parts.append(svg_case(idx,ox,oy,size))
parts.append('</svg>')
s="\n".join(parts)
open('nets3.svg','w').write(s)
s2=s.replace('class="c-teal"','fill="#cfe8e6" stroke="#2a7f7a"').replace('var(--t)','#222').replace('var(--bg,white)','white').replace('class="ts"','fill="#222" font-family="sans-serif"').replace('class="th"','fill="#222" font-family="sans-serif" font-size="14"')
open('p_nets3.svg','w').write(s2)
import cairosvg; cairosvg.svg2png(url='p_nets3.svg',write_to='nets3.png',output_width=1600)
print("done")
