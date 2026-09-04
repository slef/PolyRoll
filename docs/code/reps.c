#include <stdio.h>
#include <stdlib.h>
#include <string.h>
int K; int cnt[13]; char keys[200][40]; unsigned char best[200][12]; int nk=0;
void keyof(unsigned char*p,char*out){int seen=0; int c[13]={0}; for(int i=0;i<K;i++)if(!(seen>>i&1)){int l=0,j=i;while(!(seen>>j&1)){seen|=1<<j;l++;j=p[j];}c[l]++;} int pos=0; for(int l=1;l<=K;l++)pos+=sprintf(out+pos,"%d,",c[l]);}
void gen(int pos,unsigned char*p,int used){ if(pos==K){char k[40];keyof(p,k); for(int i=0;i<nk;i++)if(!strcmp(keys[i],k))return; strcpy(keys[nk],k);memcpy(best[nk],p,K);nk++; return;} for(int v=0;v<K;v++)if(!(used>>v&1)){p[pos]=v;gen(pos+1,p,used|1<<v);} }
int main(int argc,char**argv){K=atoi(argv[1]);unsigned char p[12];gen(0,p,0);for(int k=0;k<nk;k++){for(int i=0;i<K;i++)printf("%d ",best[k][i]);printf("\n");}return 0;}
