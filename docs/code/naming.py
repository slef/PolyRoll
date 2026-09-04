"""Unified names T_K^c_i (-f for flat): K = thickness, c = cell rotation order (4,6,3), i = index within (K,c)
ordered: solids first (by #vertices, then angle multiset descending), then flat ones."""
import pickle
from alex import Surface
import draw as D
import sys as _s
if __name__!="__main__": pass
CELLCODE={"(2,4,4)":"4","(2,3,6)":"6","(3,3,3)":"3"}
def all_rows(Kmax=7):
    rows=[]
    for K in range(2,7):
        for name in D.CELLS:
            rows+=D.enumerate_rows(K,name)
    for K in range(7,Kmax+1):
        rows+=pickle.load(open(f'rows_K{K}.pkl','rb'))
    return rows
def build(rows):
    groups={}
    for r in rows:
        S=Surface(r); key=(r['K'],CELLCODE[r['cell']])
        angs=tuple(sorted([c[2] for c in S.cones],reverse=True))
        groups.setdefault(key,[]).append((r['pi'] is not None,len(angs),tuple(-a for a in angs),r['s'],r['t']))
    label={}
    for key,items in groups.items():
        items.sort()
        for i,(deg,n,negangs,s,t) in enumerate(items):
            label[(key[0],key[1],s,t)]=(i+1,deg)
    return label
def fmt_svg(K,c,i,deg):
    # LaTeX-like  T4^3_1 : K full size, superscript c, subscript i (stacked at the same x), then -f
    return (f'T{K}<tspan dy="-6" font-size="11">{c}</tspan><tspan dy="12" font-size="11" dx="-7">{i}</tspan>'
            f'<tspan dy="-6">{"-f" if deg else ""}</tspan>')
def fmt_plain(K,c,i,deg): return f"T{K}^{c}_{i}"+("-f" if deg else "")
def fmt_file(K,c,i,deg): return f"T{K}_{c}_{i}"+("f" if deg else "")
def label_of(r,label):
    K=r['K']; c=CELLCODE[r['cell']]; i,deg=label[(K,c,r['s'],r['t'])]
    return fmt_svg(K,c,i,deg), fmt_plain(K,c,i,deg), fmt_file(K,c,i,deg)
if __name__=="__main__":
    rows=all_rows(7); label=build(rows)
    pickle.dump(label,open('labels.pkl','wb'))
    lines=["old | new | K | cell | angle sums | type"]
    pi=qi=0
    for r in rows:
        S=Surface(r); angs=sorted([c[2] for c in S.cones],reverse=True)
        if r['pi'] is None: old=f"P{pi+1}"; pi+=1
        else: old=f"Q{qi+1}"; qi+=1
        _,plain,_=label_of(r,label)
        lines.append(f"{old} | {plain} | {r['K']} | {r['cell']} | {angs} | {'flat' if r['pi'] is not None else 'solid'}")
    open('/mnt/user-data/outputs/naming_table.md','w').write("# Names T_K^c_i (-f = flat / doubly covered)\n\nc = cell rotation order: 4 = (2,4,4) square lattice, 6 = (2,3,6), 3 = (3,3,3) triangular lattice.\nWithin (K,c): solids first, ordered by number of vertices then angle multiset (descending); then flat ones.\n\n"+"\n".join(lines)+"\n")
    print(len(lines)-1,"entries")
