// Enumerate tame covers of degree K over cell (kC,kA,kB): s minimal in its conjugacy class (cycle-type rep), t arbitrary.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#define MAXK 10
int K,kC,kA,kB;
typedef struct{unsigned char p[MAXK];} P;
static inline void comp(P*r,const P*a,const P*b){for(int i=0;i<K;i++)r->p[i]=a->p[b->p[i]];}
static inline void inv(P*r,const P*a){for(int i=0;i<K;i++)r->p[a->p[i]]=i;}
static inline uint64_t code(const P*a){uint64_t c=0;for(int i=0;i<K;i++)c=c*16+a->p[i];return c;}
static inline int maxcyc(const P*a){int seen=0,mx=0;for(int i=0;i<K;i++)if(!(seen>>i&1)){int l=0,j=i;while(!(seen>>j&1)){seen|=1<<j;l++;j=a->p[j];}if(l>mx)mx=l;}return mx;}
static inline int cmpP(const P*a,const P*b){for(int i=0;i<K;i++){if(a->p[i]<b->p[i])return -1;if(a->p[i]>b->p[i])return 1;}return 0;}
// hash set
#define HS (1<<24)
uint64_t *hkeys; int *hstamp; int stamp=0;
int hins(uint64_t k){uint64_t h=(k*11400714819323198485ull)>>42; while(1){ if(hstamp[h]!=stamp){hstamp[h]=stamp;hkeys[h]=k;return 1;} if(hkeys[h]==k)return 0; h=(h+1)&(HS-1);} }
int par[MAXK]; int fnd(int x){while(par[x]!=x)x=par[x];return x;}
P *allperms; int NP;
void gen(int pos,P*cur,int used){ if(pos==K){allperms[NP++]=*cur;return;} for(int v=0;v<K;v++)if(!(used>>v&1)){cur->p[pos]=v;gen(pos+1,cur,used|1<<v);} }
P *stackP;
int main(int argc,char**argv){
  K=atoi(argv[1]);kC=atoi(argv[2]);kA=atoi(argv[3]);kB=atoi(argv[4]);
  int fact=1;for(int i=2;i<=K;i++)fact*=i; allperms=malloc(sizeof(P)*fact); P cur; NP=0; gen(0,&cur,0);
  hkeys=malloc(sizeof(uint64_t)*HS); hstamp=calloc(HS,sizeof(int)); stackP=malloc(sizeof(P)*(fact+10));
  // cycle-type representatives: s minimal lexicographic among conjugates -> check by testing s against all conjugates? cheaper: s minimal iff s == canonical of its cycle type: build reps: for each partition, the perm with cycles as consecutive blocks in decreasing... just test minimality among conjugacy class by brute force for small K on the fly (only for s passing maxcyc filter).
  P idp; for(int i=0;i<K;i++)idp.p[i]=i;
  long count=0; int nreps=0;
  for(int si=0;si<NP;si++){ P s=allperms[si]; P sB; inv(&sB,&s); if(maxcyc(&sB)>kB)continue;
    // minimal in conjugacy class?
    int minimal=1; for(int gi=0;gi<NP&&minimal;gi++){ P g=allperms[gi],gi_,c1,c; inv(&gi_,&g); comp(&c1,&g,&s); comp(&c,&c1,&gi_); if(cmpP(&c,&s)<0)minimal=0; }
    if(!minimal)continue; nreps++;
    // centralizer of s
    static P *cent=NULL; if(!cent)cent=malloc(sizeof(P)*NP); int nc=0; if(cmpP(&s,&idp)==0)continue; for(int gi=0;gi<NP;gi++){ P g=allperms[gi],a,b; comp(&a,&g,&s); comp(&b,&s,&g); if(cmpP(&a,&b)==0) cent[nc++]=g; }
    for(int ti=0;ti<NP;ti++){ P t=allperms[ti]; if(maxcyc(&t)>kC)continue; P tinv; inv(&tinv,&t); P sA; comp(&sA,&tinv,&s); if(maxcyc(&sA)>kA)continue;
      for(int i=0;i<K;i++)par[i]=i;
      for(int i=0;i<K;i++){int a=fnd(i),b=fnd(s.p[i]);if(a!=b)par[a]=b;a=fnd(i);b=fnd(t.p[i]);if(a!=b)par[a]=b;}
      int comps=0;for(int i=0;i<K;i++)if(fnd(i)==i)comps++; if(comps!=1)continue;
      // normal closure transitive
      stamp++; int sp=0; P gens[3]; P r=idp; for(int i=0;i<kA;i++){P q;comp(&q,&sA,&r);r=q;} gens[0]=r; r=idp; for(int i=0;i<kB;i++){P q;comp(&q,&sB,&r);r=q;} gens[1]=r; r=idp; for(int i=0;i<kC;i++){P q;comp(&q,&t,&r);r=q;} gens[2]=r;
      for(int g=0;g<3;g++) if(hins(code(&gens[g]))) stackP[sp++]=gens[g];
      for(int i=0;i<K;i++)par[i]=i;
      P sinv; inv(&sinv,&s);
      while(sp){ P x=stackP[--sp]; for(int i=0;i<K;i++){int a=fnd(i),b=fnd(x.p[i]);if(a!=b)par[a]=b;}
        P y1,y; comp(&y1,&s,&x); comp(&y,&y1,&sinv); if(hins(code(&y))) stackP[sp++]=y;
        comp(&y1,&t,&x); comp(&y,&y1,&tinv); if(hins(code(&y))) stackP[sp++]=y; }
      comps=0;for(int i=0;i<K;i++)if(fnd(i)==i)comps++; if(comps!=1)continue;
      // canonical: t minimal under conjugation by centralizer of s
      int best=1; for(int ci=0;ci<nc&&best;ci++){ P g=cent[ci],gi_,c1,c; inv(&gi_,&g); comp(&c1,&g,&t); comp(&c,&c1,&gi_); if(cmpP(&c,&t)<0)best=0; }
      if(!best)continue;
      count++; printf("%d %d :",si,ti); for(int i=0;i<K;i++)printf(" %d",s.p[i]); printf(" |"); for(int i=0;i<K;i++)printf(" %d",t.p[i]); printf("\n");
    } }
  fprintf(stderr,"K=%d cell(%d,%d,%d): s-reps %d, classes(conj only) %ld\n",K,kC,kA,kB,nreps,count);
  return 0; }
