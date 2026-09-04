# Overnight deliverables (Sept 1, 2026)

Tasks taken from the group-meeting transcript: OBJ files for polyroll, lattice/coloring
pages for the flat (doubly covered) cases, push the enumeration to K = 7 (and beyond),
the "every K" family, a general decision procedure, and a look at the prior-work papers.

## Files

| file | what |
|---|---|
| `obj/`, `tame_polyhedra_obj.zip` | OBJ files for P1–P16 (true faces, outward orientation, vertex numbering = PDF pages). README inside. |
| `tame_polyhedra_nets.pdf` | K = 3..6 pages (P1–P12), unchanged from last round. |
| `tame_polyhedra_nets_K7.pdf` | K = 7 pages (P13–P16), same style. |
| `doubly_covered_polygons_lattice.pdf` | Q1–Q22: the 22 doubly covered polygons for K = 2..6 on their lattice with colored marks and numbered vertices. |
| `doubly_covered_polygons_lattice_K7.pdf` | Q23–Q32: the 10 doubly covered polygons for K = 7. |
| `doubly_covered_index.txt` | index Q-number → K, cell, cone angles. |
| `enumeration_K7-10.md` | full tables of tame polyhedra for K = 7, 8, 9, 10 (angle multisets, non-degenerate vs flat). |
| `rows_K7..10.pkl` | the monodromy data (s, t permutations, cone clusters, degeneracy witness) for every class. |
| `enumK2.c`, `reps.c`, `post8.py` | the new enumerator (C, cycle-type representatives; K = 10 in 15 s) and classifier. |
| `tamecheck.py` | **general decision procedure**: input any convex polyhedron (vertices + faces) → tame/wild and exact K. |

## Enumeration counts (classes up to isometry; total / non-degenerate)

K:  2: 3/0   3: 4/1   4: 6/3   5: 9/3   6: 12/5   7: 14/4   8: 17/9   9: 17/11   10: 28/20

K = 7 non-degenerate: P13, P14 (5-vertex hexahedra on the square cell), P15 (5-vertex
hexahedron on the 30-60-90 cell), and **P16 = the right prism over the unit equilateral
triangle with height √3** — a named solid with thickness exactly 7.

## Families hitting every K

* Doubly covered strip of K unit equilateral triangles (angles 60,60,120,120): present in the
  enumeration for every K = 2..10. Proof for all K: its two adjacent lattice corners carry
  3-fold rotations, and 3-fold rotations about two adjacent lattice points already generate
  the full p3 cell group, so the holonomy is full and the thickness is the cell count K.
* Non-degenerate examples exist for every K = 3..10 (table), but I have no clean infinite
  non-degenerate family yet. Candidates from `tamecheck.py`:
  - equilateral prisms, base 1, height m·√3: K = 6m + 1 (7, 13, 19, 25, …);
    height (2m−1)·√3/2: K = 24m − 8 (16, 40, 64, 88, …); any other height: wild.
  - integer boxes a×b×c: K = 4(ab+bc+ca); unit cube K = 12; box 1×1×√2: wild.

## The decision procedure (`tamecheck.py`)

Unfold the faces along a spanning tree; every non-tree face adjacency gives a rigid motion
(the holonomy of a loop). Tame iff all rotation parts are multiples of 60° or 90° and the
translation subgroup (Schreier generators, so vertex positions enter through commutators)
is a lattice; then K = area · n / covolume with n the rotation order. It reproduces K for all
sixteen solved solids, and it caught one bad solution: the first P14 the Alexandrov pipeline
produced was a convex polyhedron with the right edge lengths but wrong angle sums (the
triangulation candidate was invalid). The pipeline now checks angle sums; the shipped P14
is verified. This is exactly the "mismatch-vector / loop-shift" criterion from our
discussion, implemented — and a cheap certificate to attach to any claimed example.

## Prior work (from the transcript's references; searched, not yet read in full)

* Hegyvári, *On the trace of polyhedra*, Geom. Dedicata 55 (1995): trace = set of plane points
  ever touched by a vertex; regular polyhedra (only the dodecahedron is trace-dense) and boxes
  (dense iff two edges with irrational ratio); sufficient condition for density. Cites Dekker
  1959 (reflections generating free products) and Wagon's Banach–Tarski book — the free-group
  connection.
* Hegyvári–Wintsche (Archimedean solids: all trace-dense except the truncated tetrahedron).
* Moore–Pach, *On traces of randomly rolling polytopes*, arXiv:2608.05721 (Aug 2026): if the
  trace has an accumulation point then a random rolling is a.s. dense; they note the
  deterministic "locally dense ⇒ dense" already follows from Bicchi–Chitour–Marigo.
* Bicchi–Chitour–Marigo, *Reachability and steering of rolling polyhedra: a case study in
  discrete nonholonomy*, IEEE TAC 49(5) 2004 (earlier WAFR 1996 / ICRA 1997 versions):
  classifies the reachable set of positions+orientations of a rolling convex polyhedron
  (dense / discrete / mixed). Their "quantized orientations" = our angle condition; their
  discrete case = our tame. What none of these have: the thickness invariant K, the exact
  formula K = area/area(cell), the full enumeration, or anything for non-convex / higher genus.
  Worth reading their proof of the dense case against our "dense ⇒ unbounded thickness" lemma.

## Not finished

* K = 8, 9, 10 Alexandrov solves and net pages (pipeline ready: `runK.py K i`; each 20–200 s;
  the angle-sum check is now in place).
* The transcript's follow-up on K = 7 doubly covered polygons is done; K = 8+ flat pages not yet rendered.
* Slit-torus triple-split examples were discussed but not drawn.
