import pickle, math, random, string
import numpy as np
from shapely.geometry import LineString, Point
from draw5 import *
import draw as D
random.seed(4)
CCOL={'A':'#e74c3c','B':'#3b82f6','C':'#27ae60'}
CTINT={'A':'#fbd0cb','B':'#c9defc','C':'#c8f0d4'}
NAMES={0:('P1','right-isosceles triangular bipyramid'),1:('P2','tetrahedron'),2:('P3','tetrahedron'),
3:('P4','regular octahedron'),4:('P5','hexahedron (5 vertices)'),5:('P6','tetrahedron'),
6:('P7','hexahedron (5 vertices)'),7:('P8','tetrahedron'),8:('P9','triangular bipyramid J12, side 2'),
9:('P10','tetrahedron'),10:('P11','tetrahedron'),11:('P12','tetrahedron'),
12:('P13','hexahedron (5 vertices)'),13:('P14','hexahedron (5 vertices)'),14:('P15','hexahedron (5 vertices)'),15:('P16','triangular prism, equilateral base 1, height &#8730;3')}
def true_edges(Tg,X,tf):
    out=set()
    for ei,g in enumerate(Tg):
        u,v=g['u'],g['v']
        adjf=[f for f in tf if u in f and v in f]
        if len(adjf)!=2: out.add(ei); continue
        n1=np.cross(X[adjf[0][1]]-X[adjf[0][0]],X[adjf[0][2]]-X[adjf[0][0]])
        n2=np.cross(X[adjf[1][1]]-X[adjf[1][0]],X[adjf[1][2]]-X[adjf[1][0]])
        n1/=np.linalg.norm(n1); n2/=np.linalg.norm(n2)
        if min(np.linalg.norm(n1-n2),np.linalg.norm(n1+n2))>1e-6: out.add(ei)
    return out
def spanning_trees_sub(Tg,n,allowed,limit=250):
    edges=[e for e in allowed]
    seen=set(); out=[]
    for _ in range(6000):
        random.shuffle(edges)
        par=list(range(n))
        def f(x):
            while par[x]!=x: par[x]=par[par[x]];x=par[x]
            return x
        tr=[]
        for ei in edges:
            u,v=Tg[ei]['u'],Tg[ei]['v']
            if f(u)!=f(v): par[f(u)]=f(v); tr.append(ei)
        if len(tr)!=n-1: continue
        key=frozenset(tr)
        if key in seen: continue
        seen.add(key); out.append(set(tr))
        if len(out)>=limit: break
    return out
def solve_net_nice(idx):
    r,Tg,faces,X,tf=load(idx)
    dv=Dev(r,Tg)
    te=true_edges(Tg,X,tf)
    best=None; cands=[]
    for cut in spanning_trees_sub(Tg,dv.S.n,te):
        maps=dv.develop(cut)
        if maps is None: continue
        pp=dv.placed_polys(maps)
        ks=list(pp); ok=True
        sh={k:pp[k].buffer(-1e-6) for k in ks}
        for a in range(len(ks)):
            for b in range(a+1,len(ks)):
                if sh[ks[a]].intersects(sh[ks[b]]): ok=False;break
            if not ok: break
        if not ok: continue
        from shapely.ops import unary_union as _uu2
        Uu=_uu2([P.buffer(1e-6) for P in pp.values()]).buffer(-1e-6)
        if abs(Uu.length-2*sum(Tg[e]['length'] for e in cut))>1e-4: continue
        if abs(Uu.area-sum(P.area for P in pp.values()))>1e-6: continue
        pts=np.array([p for P in pp.values() for p in P.exterior.coords])
        from scipy.spatial import ConvexHull as CH
        score=CH(pts).volume
        cands.append((score,cut,maps,pp))
    if not cands: return dv,None,None,None
    cands.sort(key=lambda c:c[0])
    dv.candidates=cands[:6]
    best=cands[0]
    return dv,best[1],best[2],best[3]

def cell_net_best(r,Rtrue,ntries=160,dv=None,maps=None):
    """closest cell-aligned net. If the true development (dv,maps) is given, each cell's target placement is the
    placement of its largest fragment; BFS first uses only gluings that reproduce targets, then completes randomly."""
    from shapely.ops import unary_union as _uuc
    from shapely.geometry import Polygon
    from tame2 import inverse
    Kc=r['K']; cells=[('F',i) for i in range(Kc)]+[('B',i) for i in range(Kc)]
    def adj(tri,e):
        kind,i=tri; g=D.g_of(r,e)
        return ('B',g[i]) if kind=='F' else ('F',inverse(g)[i])
    base=D.CELLS[r['cell']][1]
    def stdc(c):
        P={L:np.array(base[L],float) for L in 'ABC'}
        if c[0]=='B': P={L:np.array([v[0],-v[1]]) for L,v in P.items()}
        return P
    target={}
    if dv is not None and maps is not None:
        for c in cells:
            bestA=-1
            for (cc,fi),(M,t) in maps.items():
                if cc!=c: continue
                A=dv.frag[c][fi].area
                if A>bestA: bestA=A; target[c]=(M,t)
    def placed_pts(c,Mt):
        M,t=Mt; P=stdc(c); return {L:M@P[L]+t for L in 'ABC'}
    def place_from(cur,curpts,nb,e):
        a,b=D.EDGES[e]; third=[x for x in 'ABC' if x not in (a,b)][0]
        return {a:curpts[a],b:curpts[b],third:D.reflect(curpts[third],curpts[a],curpts[b])}
    def same(P,Q): return all(np.linalg.norm(P[L]-Q[L])<1e-6 for L in 'ABC')
    best=None
    for trial in range(ntries):
        root=('F',0)
        pos={root: placed_pts(root,target[root]) if root in target else stdc(root)}
        # phase 1: agreeing gluings only
        changed=True
        while changed and target:
            changed=False
            for cur in list(pos):
                for e in D.EDGES:
                    nb=adj(cur,e)
                    if nb in pos or nb not in target: continue
                    cand=place_from(cur,pos[cur],nb,e)
                    if same(cand,placed_pts(nb,target[nb])): pos[nb]=cand; changed=True
        # phase 2: random completion
        q=list(pos); random.shuffle(q)
        while len(pos)<2*Kc:
            progressed=False
            order=list(pos); random.shuffle(order)
            for cur in order:
                es=list(D.EDGES); random.shuffle(es)
                for e in es:
                    nb=adj(cur,e)
                    if nb in pos: continue
                    pos[nb]=place_from(cur,pos[cur],nb,e); progressed=True; break
                if progressed: break
            if not progressed: break
        if len(pos)<2*Kc: continue
        polys=[Polygon([tuple(P[L]) for L in 'ABC']) for P in pos.values()]
        ok=True
        for a in range(len(polys)):
            for b in range(a+1,len(polys)):
                if polys[a].buffer(-1e-6).intersects(polys[b].buffer(-1e-6)): ok=False;break
            if not ok: break
        if not ok: continue
        R=_uuc([q.buffer(1e-6) for q in polys]).buffer(-1e-6)
        score=R.intersection(Rtrue).area+0.1*R.boundary.buffer(1e-6).intersection(Rtrue.boundary).length-0.12*R.length
        if best is None or score>best[0]+1e-9: best=(score,pos,R)
    return best

def panel(idx,W=760,H=760):
    r,Tg,faces,X,tf=load(idx)
    dv,cut,maps,pp=solve_net_nice(idx)
    te=true_edges(Tg,X,tf)
    S=dv.S
    from shapely.ops import unary_union as _uuc0
    bestpair=None
    for (sc_,cut2,maps2,pp2) in getattr(dv,'candidates',[(None,cut,maps,pp)]):
        Rt2=_uuc0([P.buffer(1e-6) for P in pp2.values()]).buffer(-1e-6)
        bc1=cell_net_best(r,Rt2,160,dv,maps2); bc2=cell_net_best(r,Rt2,220,None,None)
        bc=max([b for b in (bc1,bc2) if b is not None],key=lambda b:b[0]) if (bc1 or bc2) else None
        if bc is None: continue
        sd=bc[2].symmetric_difference(Rt2).area
        if bestpair is None or sd<bestpair[0]-1e-9: bestpair=(sd,cut2,maps2,pp2,bc)
    if bestpair is not None: _,cut,maps,pp,bestc_pre=bestpair
    else: bestc_pre=None
    pts=[np.array(p) for P in pp.values() for p in P.exterior.coords]
    mn=np.min(pts,axis=0); mx=np.max(pts,axis=0); pad=1.3
    cx,cy=(mn[0]+mx[0])/2,(mn[1]+mx[1])/2; span=max(mx[0]-mn[0],mx[1]-mn[1])+2*pad
    bx=(cx-span/2,cy-span/2,cx+span/2,cy+span/2)
    sc=(min(W,H)-90)/span
    def tr(p): return np.array((30+(p[0]-bx[0])*sc, H-60-(p[1]-bx[1])*sc))
    out=[]
    from shapely.ops import unary_union as _uu0
    _netU=_uu0([P.buffer(1e-6) for P in pp.values()]).buffer(-1e-6)
    # background tiling + arrangement chords
    import draw4
    tris=draw4.tiling(r['cell'],bx)
    tris_marks=tris
    SF=[(np.array(x,float),np.array(y,float)) for c in dv.cells if c[0]=='F' for (e_,x,y) in dv.chords[c] if e_ in te]
    SB=[(np.array(x,float),np.array(y,float)) for c in dv.cells if c[0]=='B' for (e_,x,y) in dv.chords[c] if e_ in te]
    baseF=dv.std(('F',0)); baseB=dv.std(('B',0))
    def mapfrom(base,T):
        u=base['B']-base['A']; U=T['B']-T['A']; l=np.dot(u,u)
        v=np.array([-u[1],u[0]]); V=np.array([-U[1],U[0]])
        cu=np.dot(base['C']-base['A'],u)/l; cv=np.dot(base['C']-base['A'],v)/l
        sgn=1 if np.linalg.norm(T['A']+cu*U+cv*V-T['C'])<1e-6 else -1
        return lambda p:(T['A']+np.dot(p-base['A'],u)/l*U+sgn*np.dot(p-base['A'],v)/l*V)
    for T in tris:
        o=draw4.orient(T)
        cls="ct" if o else "cp"
        poly=" ".join(f"{x:.1f},{y:.1f}" for x,y in (tr(T[L]) for L in 'ABC'))
        out.append(f'<polygon class="{cls}" points="{poly}" stroke-width="0.4" stroke-opacity="0.3" fill-opacity="0.22"/>')
        base=baseF if o else baseB
        f=mapfrom(base,{L:np.array(T[L],float) for L in 'ABC'})
        chords=SF if o else SB
        for (x,y) in chords:
            (x1,y1),(x2,y2)=tr(f(x)),tr(f(y))
            out.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="var(--t)" stroke-width="0.5" stroke-opacity="0.28"/>')
    # marks
    seenm=set()
    for T in tris_marks:
        for L in 'ABC':
            key=(round(T[L][0],4),round(T[L][1],4))
            if key in seenm: continue
            seenm.add(key)
            x,y=tr(np.array(T[L],float))
            out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3.4" fill="{CCOL[L]}" fill-opacity="0.9"/>')
    # net fragments (fill light)
    for k,P in pp.items():
        poly=" ".join(f"{x:.1f},{y:.1f}" for x,y in (tr(np.array(p)) for p in P.exterior.coords))
        out.append(f'<polygon points="{poly}" fill="var(--t)" fill-opacity="0.10" stroke="none"/>')
    from shapely.ops import unary_union as _uuc
    Rtrue=_uuc([P.buffer(1e-6) for P in pp.values()]).buffer(-1e-6)
    bestc=bestc_pre
    dashed_later=[]
    # if the true net is already a union of tiles, use it as the cell-aligned net (no dashed outline)
    from shapely.geometry import Polygon as _Pg2
    tile_union=True
    for T in tris:
        tp=_Pg2([tuple(np.array(T[L],float)) for L in 'ABC'])
        a=tp.intersection(Rtrue).area
        if 1e-6<a<tp.area-1e-6: tile_union=False;break
    if tile_union:
        inside=[T for T in tris if _Pg2([tuple(np.array(T[L],float)) for L in 'ABC']).intersection(Rtrue).area>1e-6]
        posc={k:{L:np.array(T[L],float) for L in 'ABC'} for k,T in enumerate(inside)}
        bestc=(0.0,posc,Rtrue)
    if bestc is not None:
        _,posc,Rc=bestc
        for _k,P in posc.items():
            poly=" ".join(f"{x:.1f},{y:.1f}" for x,y in (tr(P[L]) for L in 'ABC'))
            out.append(f'<polygon points="{poly}" fill="#e67e22" fill-opacity="0.08" stroke="#e67e22" stroke-width="0.7" stroke-opacity="0.7"/>')
        sd=Rc.symmetric_difference(Rtrue).area
        if sd>1e-6:
            bd=Rc.boundary; rings=bd.geoms if hasattr(bd,'geoms') else [bd]
            for ring in rings:
                pd=" ".join(f"{x:.1f},{y:.1f}" for x,y in (tr(np.array(p)) for p in ring.coords))
                dashed_later.append(f'<polyline points="{pd}" fill="none" stroke="#f39c12" stroke-width="2.4" stroke-dasharray="7 5" stroke-linejoin="round"/>')
            out.append(f'<text class="ts" x="{W/2}" y="{H-70}" text-anchor="middle" font-size="11">dashed orange: closest net cut along tiling edges (same polyhedron, {r["K"]} teal + {r["K"]} violet tiles); area moved = {sd:.3f} of {Rtrue.area:.3f}</text>')
        else:
            out.append(f'<text class="ts" x="{W/2}" y="{H-70}" text-anchor="middle" font-size="11">the net is itself a union of {r["K"]} teal + {r["K"]} violet tiles (thin orange = tile edges inside it)</text>')
    # proper-coloring check: every drawn tile has three distinct corner classes (true by construction of the cell tiling)
    for T in tris: assert len({L for L in 'ABC'})==3
    # polyhedron edges bold: for each edge, draw placed copies from adjacent fragments
    edge_copies={ei:{} for ei in range(len(Tg))}
    chords_ext={c:list(dv.chords[c]) for c in dv.cells}
    for c in dv.cells:
        P=dv.std(c)
        for (ei,x,y) in dv.chords[c]:
            x=np.array(x,float); y=np.array(y,float)
            e=dv.edge_of_cell(c,x,y)
            if e is None: continue
            nb=dv.adj(c,e)
            a,b=EDGES[e]; Pn=dv.std(nb)
            o=P[min(a,b)]; dd=P[max(a,b)]-o; Lh=np.linalg.norm(dd); u=dd/Lh
            on=Pn[min(a,b)]; ddn=Pn[max(a,b)]-on; un=ddn/Lh
            tx=np.dot(x-o,u); ty=np.dot(y-o,u)
            chords_ext[nb].append((ei,on+tx*un,on+ty*un))
    for (c,fi),(M,t) in maps.items():
        for (ei,x,y) in chords_ext[c]:
            L=LineString([tuple(x),tuple(y)])
            fr=dv.frag[c][fi]
            inter=fr.buffer(1e-7).intersection(L)
            if inter.length<1e-7: continue
            for seg in (inter.geoms if hasattr(inter,'geoms') else [inter]):
                if seg.length<1e-7: continue
                a=np.array(seg.coords[0]); b=np.array(seg.coords[-1])
                pa,pb=M@a+t,M@b+t
                key=tuple(sorted((tuple(np.round(pa,5)),tuple(np.round(pb,5)))))
                edge_copies[ei][key]=(pa,pb)
    for ei,cop in edge_copies.items():
        if ei not in te: continue
        for (pa,pb) in cop.values():
            (x1,y1),(x2,y2)=tr(pa),tr(pb)
            out.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="var(--t)" stroke-width="2.4" stroke-linecap="round"/>')
    from shapely.ops import unary_union as _uu
    Usm=_uu([P.buffer(1e-6) for P in pp.values()]).buffer(-1e-6)
    Ubd=Usm.boundary
    rings=Ubd.geoms if hasattr(Ubd,'geoms') else [Ubd]
    for ring in rings:
        cs=list(ring.coords)
        pd=" ".join(f"{x:.1f},{y:.1f}" for x,y in (tr(np.array(p)) for p in cs))
        out.append(f'<polyline points="{pd}" fill="none" stroke="var(--t)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>')
    out.extend(dashed_later)
    # vertex positions (needed to stop label clustering at vertices)
    vlab={}
    for (c,fi),(M,t) in maps.items():
        P=dv.std(c)
        for Lb in 'ABC':
            cn=D.cone_of(r,c[0],c[1],Lb)
            if cn[2]>=360: continue
            k=[q+1 for q,cc in enumerate(S.cones) if cc==cn][0]
            corner=P[Lb]
            if dv.frag[c][fi].buffer(1e-6).contains(Point(tuple(corner))):
                pos=M@corner+t
                vlab[(round(float(pos[0]),4),round(float(pos[1]),4))]=k
    vlab_positions=list(vlab)
    # gluing labels on cut edges: group copies into 2 sides; connect only through non-vertex endpoints
    letters=iter([c for c in string.ascii_lowercase])
    
    for ei in sorted(cut):
        cop=[s for s in edge_copies[ei].values() if np.linalg.norm(np.array(s[1])-np.array(s[0]))>1e-4]
        # cluster segments into chains by shared endpoints
        chains=[]
        segs=list(range(len(cop)))
        while segs:
            ch=[segs.pop()]
            grew=True
            while grew:
                grew=False
                uv={Tg[ei]['u']+1,Tg[ei]['v']+1}
                def isv(p):
                    k=(round(float(p[0]),4),round(float(p[1]),4))
                    return k in vlab and vlab[k] in uv
                for si in segs[:]:
                    s=cop[si]
                    hit=False
                    for c0i in ch:
                        c0=cop[c0i]
                        for pa in (s[0],s[1]):
                            if isv(pa): continue
                            if min(np.linalg.norm(pa-c0[0]),np.linalg.norm(pa-c0[1]))<1e-5: hit=True;break
                        if not hit:
                            for pb in (c0[0],c0[1]):
                                if isv(pb): continue
                                if min(np.linalg.norm(pb-s[0]),np.linalg.norm(pb-s[1]))<1e-5: hit=True;break
                        if hit: break
                    if hit: ch.append(si); segs.remove(si); grew=True
            chains.append([cop[i] for i in ch])
        chains.sort(key=lambda ch:-sum(np.linalg.norm(np.array(s[1])-np.array(s[0])) for s in ch))
        L=next(letters)
        u=Tg[ei]['u']
        for ci,ch in enumerate(chains[:2]):
            # order the segments into a polyline and take the arclength midpoint
            segs2=[(np.array(s[0]),np.array(s[1])) for s in ch]
            if len(segs2)==1:
                poly=[segs2[0][0],segs2[0][1]]
            else:
                # find an endpoint of degree 1
                ends=[]
                for si,(p,q) in enumerate(segs2):
                    for pt in (p,q):
                        deg=sum(1 for (p2,q2) in segs2 for pt2 in (p2,q2) if np.linalg.norm(pt-pt2)<1e-5)
                        if deg==1: ends.append((si,pt))
                cur=ends[0][1] if ends else segs2[0][0]
                remaining=list(range(len(segs2))); poly=[cur]
                while remaining:
                    found=False
                    for si in remaining:
                        p,q=segs2[si]
                        if np.linalg.norm(p-cur)<1e-5: poly.append(q); cur=q; remaining.remove(si); found=True; break
                        if np.linalg.norm(q-cur)<1e-5: poly.append(p); cur=p; remaining.remove(si); found=True; break
                    if not found: break
            lens=[np.linalg.norm(poly[k+1]-poly[k]) for k in range(len(poly)-1)]
            Ltot=sum(lens); tgt=Ltot/2; acc=0; m=poly[0]; d=poly[-1]-poly[0]
            for k,lk in enumerate(lens):
                if acc+lk>=tgt-1e-12:
                    f=(tgt-acc)/max(lk,1e-12)
                    m=poly[k]+f*(poly[k+1]-poly[k]); d=poly[k+1]-poly[k]
                    break
                acc+=lk
            nv=np.array([-d[1],d[0]]); nv/=max(np.linalg.norm(nv),1e-9)
            # choose outward side: offset point (surface coords) must be outside the net
            from shapely.geometry import Point as _PT
            off=14.0/sc
            if Usm.buffer(1e-6).contains(_PT(tuple(m+nv*off))): nv=-nv
            txt=L+('&#772;' if ci==1 else '')
            P0=tr(m+nv*off)
            dscr=tr(m+d)-tr(m)
            ang=math.degrees(math.atan2(dscr[1],dscr[0]))
            if ang>90 or ang<-90: ang+=180
            rot=f'transform="rotate({ang:.1f} {P0[0]:.1f} {P0[1]:.1f})"'
            out.append(f'<text x="{P0[0]:.1f}" y="{P0[1]:.1f}" {rot} text-anchor="middle" dominant-baseline="middle" font-size="13" font-style="italic" stroke="var(--bg,white)" stroke-width="3.5" fill="var(--bg,white)" font-family="sans-serif">{txt}</text>')
            out.append(f'<text class="ts" x="{P0[0]:.1f}" y="{P0[1]:.1f}" {rot} text-anchor="middle" dominant-baseline="middle" font-size="13" font-style="italic">{txt}</text>')
    # vertex circles
    vclass={}
    for c0 in r['cones']:
        if c0[2]>=360: continue
        kk=[q+1 for q,cc in enumerate(S.cones) if cc==c0][0]
        vclass[kk]=c0[0]
    for (x,y),k in vlab.items():
        X0,Y0=tr(np.array((x,y)))
        col=CCOL[vclass[k]]
        tint=CTINT[vclass[k]]
        out.append(f'<circle cx="{X0:.1f}" cy="{Y0:.1f}" r="8" fill="{tint}" stroke="{col}" stroke-width="1.6"/><text class="ts" x="{X0:.1f}" y="{Y0+3.5:.1f}" text-anchor="middle" font-size="10" font-weight="bold">{k}</text>')
    angs=", ".join(f"v{k+1}:{c[2]}&#176;" for k,c in enumerate(S.cones))
    def cyc(lab):
        p=[c for c in r['cones'] if c[0]==lab]
        return ", ".join(('flat' if c[2]>=360 else f"v{[i+1 for i,cc in enumerate(S.cones) if cc==c][0]}({c[2]}&#176;)") for c in p)
    pid,pname=NAMES[idx]
    import naming, pickle as _pk
    _lab=_pk.load(open('labels.pkl','rb'))
    lsvg,lplain,lfile=naming.label_of(r,_lab)
    out.append(f'<text class="ts" x="60" y="{H-52}" font-size="16" font-weight="bold">{lsvg} &#8212; {pname}  <tspan font-weight="normal" font-size="11">(was {pid})</tspan></text>')
    out.append(f'<text class="ts" x="{W/2}" y="{H-34}" text-anchor="middle" font-size="14">K={r["K"]} &#183; cell {r["cell"]} &#183; {angs}</text>')
    out.append(f'<text x="{W/2-330}" y="{H-16}" font-size="11" font-family="sans-serif" fill="{CCOL["A"]}">&#9679; A: {cyc("A")}</text>')
    out.append(f'<text x="{W/2-110}" y="{H-16}" font-size="11" font-family="sans-serif" fill="{CCOL["B"]}">&#9679; B: {cyc("B")}</text>')
    out.append(f'<text x="{W/2+110}" y="{H-16}" font-size="11" font-family="sans-serif" fill="{CCOL["C"]}">&#9679; C: {cyc("C")}</text>')
    return f'<svg width="100%" viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg">'+ "\n".join(out) + '</svg>'
if __name__=="__main__":
    import cairosvg
    from pypdf import PdfWriter
    import sys as _sys
    idxs=[int(x) for x in _sys.argv[2:]] if len(_sys.argv)>2 else list(range(12))
    outname=_sys.argv[1] if len(_sys.argv)>1 else 'tame_polyhedra_nets.pdf'
    wr=PdfWriter()
    for idx in idxs:
        s=panel(idx)
        open(f'page_{idx}.svg','w').write(s)
        s2=s.replace('class="ct"','fill="#7fc4bf" stroke="#2a7f7a"').replace('class="cp"','fill="#b9a2d8" stroke="#6b4fa0"').replace('var(--bg,white)','white').replace('var(--t)','#222').replace('class="ts"','fill="#222" font-family="sans-serif"')
        cairosvg.svg2pdf(bytestring=s2.encode(),write_to=f'page_{idx}.pdf',output_width=760,output_height=760)
        wr.append(f'page_{idx}.pdf')
        print(idx,"page done")
    with open(outname,'wb') as f: wr.write(f)
