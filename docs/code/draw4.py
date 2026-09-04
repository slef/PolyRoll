import pickle, math, random
import numpy as np
from alex import *
import draw as D
random.seed(11)
def tiling(cellname, bbox):
    (orders,base)=CELLS[cellname]
    base={L:np.array(base[L],float) for L in 'ABC'}
    tris=[]; seen=set(); 
    start=tuple((L,round(base[L][0],5),round(base[L][1],5)) for L in 'ABC')
    q=[dict(base)]; seen.add(frozenset((round(base[L][0],5),round(base[L][1],5)) for L in 'ABC'))
    tris.append(dict(base))
    x0,y0,x1,y1=bbox
    while q:
        T=q.pop()
        for e,(a,b) in EDGES.items():
            c=[x for x in 'ABC' if x not in (a,b)][0]
            T2={a:T[a],b:T[b],c:reflect(T[c],T[a],T[b])}
            cen=sum(T2.values())/3
            if not(x0-1<cen[0]<x1+1 and y0-1<cen[1]<y1+1): continue
            key=frozenset((round(T2[L][0],5),round(T2[L][1],5)) for L in 'ABC')
            if key in seen: continue
            seen.add(key); tris.append(T2); q.append(T2)
    return tris
def orient(T):
    u=T['B']-T['A']; v=T['C']-T['A']
    return u[0]*v[1]-u[1]*v[0]>0
def case_panel(idx,ox,oy,W,H):
    r,Tg,faces,X,tf=pickle.load(open(f'sol_{idx}.pkl','rb'))
    S=Surface(r); K=r['K']
    # net development (cell-edge unfolding)
    net=D.net(r)
    pts=[p for P in net.values() for p in P.values()]
    mn=np.min(pts,axis=0); mx=np.max(pts,axis=0)
    pad=1.2
    bbox=(mn[0]-pad,mn[1]-pad,mx[0]+pad,mx[1]+pad)
    tris=tiling(r['cell'],bbox)
    span=max(bbox[2]-bbox[0],bbox[3]-bbox[1]); sc=(min(W,H)-70)/span
    def tr(p): return (ox+15+(p[0]-bbox[0])*sc, oy+H-45-(p[1]-bbox[1])*sc)
    out=[]
    for T in tris:
        poly=" ".join(f"{x:.1f},{y:.1f}" for x,y in (tr(T[L]) for L in 'ABC'))
        cls="ct" if orient(T) else "cp"
        out.append(f'<polygon class="{cls}" points="{poly}" stroke-width="0.5" stroke-opacity="0.35" fill-opacity="0.25"/>')
    # corner marks by class
    shapes={'A':'circle','B':'rect','C':'diamond'}
    markseen=set()
    for T in tris:
        for L in 'ABC':
            key=(round(T[L][0],4),round(T[L][1],4))
            if key in markseen: continue
            markseen.add(key)
            x,y=tr(T[L])
            if bbox[0]-.5<T[L][0]<bbox[2]+.5 and bbox[1]-.5<T[L][1]<bbox[3]+.5:
                if L=='A': out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3.2" fill="var(--t)"/>')
                elif L=='B': out.append(f'<rect x="{x-3:.1f}" y="{y-3:.1f}" width="6" height="6" fill-opacity="0.75" fill="var(--t)"/>')
                else: out.append(f'<path d="M {x:.1f} {y-4:.1f} L {x+4:.1f} {y:.1f} L {x:.1f} {y+4:.1f} L {x-4:.1f} {y:.1f} Z" fill="none" stroke="var(--t)" stroke-width="1.3"/>')
    # overlay net outline: boundary edges of net (edges not shared between two placed cells)
    for (kind,i),P in net.items():
        poly=" ".join(f"{x:.1f},{y:.1f}" for x,y in (tr(P[L]) for L in 'ABC'))
        out.append(f'<polygon points="{poly}" fill="var(--t)" fill-opacity="0.10" stroke="none"/>')
    segs={}
    for (kind,i),P in net.items():
        for e,(a,b) in EDGES.items():
            key=frozenset((tuple(np.round(P[a],4)),tuple(np.round(P[b],4))))
            segs[key]=segs.get(key,0)+1
    for key,cnt in segs.items():
        if cnt==1:
            (x1,y1),(x2,y2)=[tr(np.array(p)) for p in key]
            out.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="var(--t)" stroke-width="2.2"/>')
    # map std coords of a cell to its placed position in the net
    def place_map(tri):
        Sd=dict(CELLS[r['cell']][1]); Sd={L:np.array(Sd[L],float) for L in 'ABC'}
        if tri[0]=='B': Sd={L:np.array([v[0],-v[1]]) for L,v in Sd.items()}
        P=net[tri]
        u=Sd['B']-Sd['A']; v=np.array([-u[1],u[0]]); l=np.dot(u,u)
        U=P['B']-P['A']
        cu=np.dot(Sd['C']-Sd['A'],u)/l; cv=np.dot(Sd['C']-Sd['A'],v)/l
        V=np.array([-U[1],U[0]])
        sgn=1 if np.linalg.norm(P['A']+cu*U+cv*V-P['C'])<1e-6 else -1
        def f(p):
            a=np.dot(p-Sd['A'],u)/l; b=np.dot(p-Sd['A'],v)/l
            return P['A']+a*U+sgn*b*V
        return f
    # bold actual polyhedron edges (geodesic pieces mapped into the net)
    for g in Tg:
        for (tri,x,y) in g['pieces']:
            f=place_map(tri)
            (x1,y1),(x2,y2)=tr(f(np.array(x))),tr(f(np.array(y)))
            out.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="var(--t)" stroke-width="3" stroke-linecap="round" stroke-opacity="0.85"/>')
    # gluing labels on the net boundary
    import string as _st
    bound=[]
    for (kind,i),P in net.items():
        for e,(a,b) in EDGES.items():
            key=frozenset((tuple(np.round(P[a],4)),tuple(np.round(P[b],4))))
            if segs[key]==1: bound.append(((kind,i),e))
    letters=iter(_st.ascii_lowercase); lab={}
    def adjf(tri,e):
        kind,i=tri; g=D.g_of(r,e)
        from tame2 import inverse as inv
        return ('B',g[i]) if kind=='F' else ('F',inv(g)[i])
    for (tri,e) in bound:
        key=frozenset([(tri,e),(adjf(tri,e),e)])
        if key not in lab: lab[key]=next(letters)
    seen1=set()
    for (tri,e) in bound:
        key=frozenset([(tri,e),(adjf(tri,e),e)])
        L=lab[key]; bar = key in seen1; seen1.add(key)
        a,b=EDGES[e]; P=net[tri]
        p1,p2=np.array(tr(P[a])),np.array(tr(P[b]))
        cen=np.array(tr(sum(P[x] for x in 'ABC')/3))
        m=(p1+p2)/2; nv=m-cen; nv/=max(np.linalg.norm(nv),1e-9)
        txt=L+('&#772;' if bar else '')
        out.append(f'<text class="ts" x="{m[0]+10*nv[0]:.1f}" y="{m[1]+10*nv[1]+3:.1f}" text-anchor="middle" font-size="10" font-style="italic">{txt}</text>')
        dd=min(a,b)
        pd=np.array(tr(P[dd]))+ (np.array(tr(P[a if a!=dd else b]))-np.array(tr(P[dd])))*0.22
        out.append(f'<circle cx="{pd[0]:.1f}" cy="{pd[1]:.1f}" r="1.8" fill="var(--t)"/>')
    # numbered vertices on the net
    vlab={}
    for (kind,i),P in net.items():
        for Lb in 'ABC':
            c=D.cone_of(r,kind,i,Lb)
            if c[2]>=360: continue
            k=[q+1 for q,cc in enumerate(S.cones) if cc==c][0]
            vlab[(round(float(P[Lb][0]),4),round(float(P[Lb][1]),4))]=k
    for (x,y),k in vlab.items():
        X0,Y0=tr((x,y))
        out.append(f'<circle cx="{X0:.1f}" cy="{Y0:.1f}" r="6" fill="var(--bg,white)" stroke="var(--t)" stroke-width="0.8"/><text class="ts" x="{X0:.1f}" y="{Y0+3:.1f}" text-anchor="middle" font-size="8" font-weight="bold">{k}</text>')
    # legend: vertex classes per corner
    def cyc(lab):
        ks={'A':1,'B':2,'C':0}
        p=[c for c in r['cones'] if c[0]==lab]
        parts=[]
        for c in p:
            if c[2]>=360: parts.append('flat')
            else:
                k=[i+1 for i,cc in enumerate(S.cones) if cc==c][0]
                parts.append(f"v{k}({c[2]}&#176;)")
        return ", ".join(parts)
    angs=", ".join(f"v{k+1}:{c[2]}&#176;" for k,c in enumerate(S.cones))
    out.append(f'<text class="tsb" x="{ox+W/2}" y="{oy+H-28}" text-anchor="middle" font-size="12">K={K} &#183; cell {r["cell"]} &#183; {angs}</text>')
    out.append(f'<text class="ts" x="{ox+W/2}" y="{oy+H-14}" text-anchor="middle" font-size="10">&#9679; A-marks: {cyc("A")} &#8195; &#9632; B-marks: {cyc("B")} &#8195; &#9671; C-marks: {cyc("C")}</text>')
    return "\n".join(out)
W,H=520,470; cols=2; n=12
rows=(n+cols-1)//cols
parts=[f'<svg width="100%" viewBox="0 0 {cols*(W+16)+16} {rows*(H+14)+40}" xmlns="http://www.w3.org/2000/svg">',
'<text class="th" x="12" y="24">Rolling tilings: cell tiling (teal/violet = tile orientation), corner marks by class, one full development overlaid (bold outline, 2K cells)</text>']
for idx in range(12):
    ox=16+(idx%cols)*(W+16); oy=38+(idx//cols)*(H+14)
    parts.append(case_panel(idx,ox,oy,W,H))
parts.append('</svg>')
s="\n".join(parts)
sw=s.replace('class="ct"','fill="var(--c1,#7fc4bf)" stroke="var(--t)"').replace('class="cp"','fill="var(--c2,#b9a2d8)" stroke="var(--t)"')
open('tilings.svg','w').write(sw)
s2=s.replace('var(--bg,white)','white').replace('class="ct"','fill="#7fc4bf" stroke="#2a7f7a"').replace('class="cp"','fill="#b9a2d8" stroke="#6b4fa0"').replace('var(--t)','#222').replace('class="ts"','fill="#222" font-family="sans-serif"').replace('class="tsb"','fill="#222" font-family="sans-serif"').replace('class="th"','fill="#222" font-family="sans-serif" font-size="13"')
open('p_tilings.svg','w').write(s2)
import cairosvg; cairosvg.svg2png(url='p_tilings.svg',write_to='tilings.png',output_width=1700)
print("ok")
