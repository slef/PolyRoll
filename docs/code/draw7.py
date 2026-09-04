import math, numpy as np, string
import draw as D
import draw4
from alex import Surface
from tame2 import inverse
CCOL={'A':'#e74c3c','B':'#3b82f6','C':'#27ae60'}
CTINT={'A':'#fbd0cb','B':'#c9defc','C':'#c8f0d4'}
EDGES=D.EDGES
def shape_name(n,angs):
    return {3:'triangle',4:'quadrilateral',5:'pentagon',6:'hexagon'}.get(n,f'{n}-gon')
def panel(row,qid,W=760,H=760):
    K=row['K']; S=Surface(row)
    pos,segs=D.polygon(row)
    pts=[np.array(p) for P in pos.values() for p in P.values()]
    mn=np.min(pts,axis=0); mx=np.max(pts,axis=0); pad=1.3
    bx=(mn[0]-pad,mn[1]-pad,mx[0]+pad,mx[1]+pad)
    span=max(bx[2]-bx[0],bx[3]-bx[1]); sc=(min(W,H)-90)/span
    def tr(p): return np.array((30+(p[0]-bx[0])*sc, H-60-(p[1]-bx[1])*sc))
    out=[]
    tris=draw4.tiling(row['cell'],bx)
    for T in tris:
        cls="ct" if draw4.orient(T) else "cp"
        poly=" ".join(f"{x:.1f},{y:.1f}" for x,y in (tr(np.array(T[L],float)) for L in 'ABC'))
        out.append(f'<polygon class="{cls}" points="{poly}" stroke-width="0.4" stroke-opacity="0.3" fill-opacity="0.22"/>')
    seen=set()
    for T in tris:
        for L in 'ABC':
            key=(round(T[L][0],4),round(T[L][1],4))
            if key in seen: continue
            seen.add(key); x,y=tr(np.array(T[L],float))
            out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3.4" fill="{CCOL[L]}" fill-opacity="0.9"/>')
    # polygon cells (front sheets) filled, cell edges thin
    for (kind,i),P in pos.items():
        poly=" ".join(f"{x:.1f},{y:.1f}" for x,y in (tr(P[L]) for L in 'ABC'))
        out.append(f'<polygon points="{poly}" fill="var(--t)" fill-opacity="0.12" stroke="var(--t)" stroke-width="0.6" stroke-opacity="0.5"/>')
    # boundary bold
    for a,b,ca,cb in segs:
        (x1,y1),(x2,y2)=tr(np.array(a)),tr(np.array(b))
        out.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="var(--t)" stroke-width="3.2" stroke-linecap="round"/>')
    # vertices: polygon corners = cone points (angle<360, and polygon angle != 180)
    vlab={}
    for (kind,i),P in pos.items():
        for L in 'ABC':
            c=D.cone_of(row,kind,i,L)
            if c[2]>=360: continue
            k=[q+1 for q,cc in enumerate(S.cones) if cc==c][0]
            vlab[(round(float(P[L][0]),4),round(float(P[L][1]),4))]=(k,c[0])
    for (x,y),(k,lab) in vlab.items():
        X0,Y0=tr(np.array((x,y)))
        out.append(f'<circle cx="{X0:.1f}" cy="{Y0:.1f}" r="8" fill="{CTINT[lab]}" stroke="{CCOL[lab]}" stroke-width="1.6"/><text class="ts" x="{X0:.1f}" y="{Y0+3.5:.1f}" text-anchor="middle" font-size="10" font-weight="bold">{k}</text>')
    n=S.n
    angs=", ".join(f"v{k+1}:{c[2]}&#176;" for k,c in enumerate(S.cones))
    pangs=", ".join(f"{c[2]//2}&#176;" for c in S.cones)
    def cyc(lab):
        p=[c for c in row['cones'] if c[0]==lab]
        return ", ".join(('flat' if c[2]>=360 else f"v{[i+1 for i,cc in enumerate(S.cones) if cc==c][0]}({c[2]}&#176;)") for c in p)
    import naming, pickle as _pk
    _lab=_pk.load(open('labels.pkl','rb'))
    lsvg,lplain,lfile=naming.label_of(row,_lab)
    out.append(f'<text class="ts" x="60" y="{H-52}" font-size="16" font-weight="bold">{lsvg} &#8212; doubly covered {shape_name(n,None)} (angles {pangs})  <tspan font-weight="normal" font-size="11">(was {qid})</tspan></text>')
    out.append(f'<text class="ts" x="{W/2}" y="{H-34}" text-anchor="middle" font-size="14">K={K} &#183; cell {row["cell"]} &#183; cone angles {angs} &#183; {K} cells per face</text>')
    out.append(f'<text x="{W/2-330}" y="{H-16}" font-size="11" font-family="sans-serif" fill="{CCOL["A"]}">&#9679; A: {cyc("A")}</text>')
    out.append(f'<text x="{W/2-110}" y="{H-16}" font-size="11" font-family="sans-serif" fill="{CCOL["B"]}">&#9679; B: {cyc("B")}</text>')
    out.append(f'<text x="{W/2+110}" y="{H-16}" font-size="11" font-family="sans-serif" fill="{CCOL["C"]}">&#9679; C: {cyc("C")}</text>')
    return f'<svg width="100%" viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg">'+"\n".join(out)+'</svg>'
if __name__=="__main__":
    import cairosvg
    from pypdf import PdfWriter
    rows=[]
    for K in [2,3,4,5,6]:
        for name in D.CELLS:
            for r in D.enumerate_rows(K,name):
                if r['pi'] is not None: rows.append(r)
    wr=PdfWriter(); index=[]
    for i,r in enumerate(rows):
        qid=f"Q{i+1}"
        s=panel(r,qid)
        s2=s.replace('class="ct"','fill="#7fc4bf" stroke="#2a7f7a"').replace('class="cp"','fill="#b9a2d8" stroke="#6b4fa0"').replace('var(--t)','#222').replace('class="ts"','fill="#222" font-family="sans-serif"')
        open(f'q_{i}.svg','w').write(s2)
        cairosvg.svg2pdf(bytestring=s2.encode(),write_to=f'q_{i}.pdf',output_width=760,output_height=760)
        wr.append(f'q_{i}.pdf')
        S=Surface(r)
        index.append(f"{qid}: K={r['K']} cell {r['cell']} cone angles {[c[2] for c in S.cones]}")
        print(qid,"done")
    with open('doubly_covered_polygons_lattice.pdf','wb') as f: wr.write(f)
    open('doubly_covered_index.txt','w').write("\n".join(index)+"\n")
