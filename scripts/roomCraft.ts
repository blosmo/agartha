import type { WorldEdit } from '../apps/web/src/worlds/world';
type Piece = NonNullable<WorldEdit['objects']>[number];
type Point = [number,number,number];

/** Authored furnishings built from the same editable primitives available to agents. */
export function roomCraft() {
  let pieces: Piece[] = [], serial = 0;
  const add = (name:string, shape:Piece['shape'], position:Point, scale:Point, color:string, yaw=0) => {
    pieces.push({id:`craft-${serial++}`,name,shape,position,scale,color,yaw});
  };
  const box = (name:string,p:Point,s:Point,c:string,yaw=0) => add(name,'box',p,s,c,yaw);
  const cylinder = (name:string,p:Point,s:Point,c:string) => add(name,'cylinder',p,s,c);
  const sphere = (name:string,p:Point,s:Point,c:string) => add(name,'sphere',p,s,c);
  function planter(x:number,z:number,size=1) {
    cylinder('Glazed planter',[x,.6*size,z],[1.5*size,1.2*size,1.5*size],'#576e65');
    cylinder('Dark soil',[x,1.22*size,z],[1.25*size,.12,1.25*size],'#414739');
    for(let i=0;i<5;i++) {const a=i*2.4; sphere('Fern frond',[x+Math.cos(a)*.55*size,(1.8+(i%2)*.4)*size,z+Math.sin(a)*.55*size],[.9*size,1.2*size,.65*size],i%2?'#547867':'#789578');}
  }
  function bench(x:number,z:number,yaw=0) {
    const part=(name:string,dx:number,y:number,dz:number,s:Point,c:string) => box(name,[x+Math.cos(yaw)*dx+Math.sin(yaw)*dz,y,z-Math.sin(yaw)*dx+Math.cos(yaw)*dz],s,c,yaw);
    part('Walnut bench seat',0,1,0,[4,.3,1.5],'#765d48');
    for(const dx of [-1.5,1.5]) part('Bench foot',dx,.45,0,[.3,.9,1.1],'#4b5045');
    part('Linen seat cushion',0,1.22,0,[3.5,.2,1.2],'#c4bca0');
    part('Low bench back',0,1.7,-.65,[4,1.2,.18],'#87705a');
  }
  function bookcase(x:number,z:number) {
    for(const dx of [-2.6,2.6]) box('Walnut bookcase stile',[x+dx,2.5,z],[.22,5,1.3],'#665443');
    box('Bookcase backing',[x,2.5,z-.55],[5.2,5,.15],'#594c41');
    for(let row=0;row<3;row++) {
      const y=.4+row*1.6;
      box('Bookcase shelf',[x,y,z],[5.4,.18,1.4],'#8e785b');
      for(let i=0;i<7;i++) box('Clothbound volume',[x-2.15+i*.67,y+.57+(i%3)*.08,z],[.4,.95+(i%3)*.16,.9],['#426760','#9b815e','#b3ac89','#6d7780'][i%4]);
    }
    box('Bookcase cornice',[x,5,z],[5.6,.25,1.55],'#a69069');
  }
  function table(x:number,z:number) {
    box('Craft table top',[x,1.7,z],[5,.35,2.4],'#9c7c55');
    for(const dx of [-2,2]) for(const dz of [-.8,.8]) box('Table leg',[x+dx,.75,z+dz],[.25,1.5,.25],'#555447');
  }
  function cup(x:number,y:number,z:number) {
    cylinder('Porcelain saucer',[x,y,z],[.65,.1,.65],'#dbd3b7');
    cylinder('Tea bowl',[x,y+.18,z],[.4,.3,.4],'#afc2ad');
    cylinder('Tea',[x,y+.34,z],[.3,.1,.3],'#6d6748');
  }
  function rug(x:number,z:number,width:number,depth:number,color:string) {
    box('Woven rug border',[x,.08,z],[width,.12,depth],'#c4b28b');
    box('Woven rug field',[x,.15,z],[width-.5,.1,depth-.5],color);
    for(const side of [-1,1]) for(let i=0;i<5;i++) box('Rug stitching',[x-width*.35+i*width*.175,.21,z+side*(depth/2-.5)],[.45,.1,.15],'#c4b28b');
  }
  function reset(){pieces=[];serial=0;}
  function finish(id:string,brief:string){return {id,brief,objects:pieces};}

  // Common Future: a inhabited tea courtyard around the existing pavilion.
  rug(-8,3,7,6,'#6e8980'); bench(-8,1); bench(-8,5,Math.PI);
  table(-8,3); cup(-9,1.92,3);cup(-7,1.92,3);
  cylinder('Teapot',[ -8,2.15,3],[.8,.6,.8],'#b69a71');
  sphere('Teapot lid',[-8,2.5,3],[.5,.2,.5],'#dbc89c');
  for(const [x,z] of [[-12,-11],[12,-11],[11,10],[-12,9]]) planter(x,z,1.25);
  for(const x of [-8,8]) {
    for(let i=0;i<5;i++) cylinder('River stone at sculpture',[x-1.5+i*.7,.22,-8],[.7,.4,.6],i%2?'#a0aa96':'#697b72');
  }
  bookcase(8,-13.5);
  bench(8,2,Math.PI/2);
  for(let i=0;i<4;i++) box('Path to tea',[0,.07,4+i*1.2],[1.7,.15,.8],'#bcc1ab');
  cylinder('Rain jar',[11,1.1,6],[1.7,2.2,1.7],'#6b908d');
  cylinder('Rain jar lip',[11,2.22,6],[1.8,.18,1.8],'#a8c2ae');
  const common=finish('plot-1-1','A tea courtyard shared by readers and wanderers. Jade forms hover above river-stone plinths; a woven rug, porcelain bowls and a small library invite you to linger beside the rippling water.');

  // Tidal Chamber: shelves, stepping stones, foliage and a quiet waterside alcove.
  reset(); bookcase(-8,-13.5);bookcase(8,-13.5);
  rug(-10,6,5,7,'#587f81');bench(-11,6,Math.PI/2);
  box('Folded bath linen',[-11,1.5,6],[1.2,.5,.8],'#d1ccae');
  for(const [x,z] of [[-12,-9],[12,-9],[-12,11],[12,11]]) planter(x,z,1.1);
  for(let i=0;i<18;i++) {
    const a=i*Math.PI/9;
    cylinder('Pool coping',[Math.cos(a)*8.85,.65,Math.sin(a)*8.85],[1.25,.25,1.25],i%3?'#a9b6a3':'#7d9790');
  }
  for(const x of [-5,5]) {
    cylinder('Candle tray',[x,.9,-10.8],[1.4,.2,1.4],'#8c7b5b');
    for(let i=0;i<3;i++) {cylinder('Beeswax candle',[x+(i-1)*.35,1.2+i*.1,-10.8],[.22,.5+i*.2,.22],'#ded3a5');sphere('Candle flame',[x+(i-1)*.35,1.5+i*.2,-10.8],[.15,.25,.15],'#f0cd79');}
  }
  box('Low reading table',[10.7,1.25,5],[2.5,.25,3],'#8c7961');
  box('Table pedestal',[10.7,.6,5],[.6,1.2,1.5],'#5c6b62');
  box('Open folio left',[10.1,1.47,5],[.9,.12,1.2],'#d9cdab',-.12);
  box('Open folio right',[11.1,1.47,5],[.9,.12,1.2],'#d9cdab',.12);
  const tidal=finish('plot-2-1','A moonlit reading bath with jade water, weathered stone, walnut bookshelves and beeswax candles. A pearl moon rises and falls above the pool. Leave your book on the low table, cross the stepping stones, and listen to the water.');

  // Sun Engine: an occupied clockmaker's workshop surrounding the kinetic centerpiece.
  reset(); rug(-9,-8,8,6,'#79775e');table(-9,-8);
  for(let i=0;i<5;i++) cylinder('Brass gear blank',[-10.7+i*.85,1.98,-8],[.55,.15,.55],i%2?'#b69960':'#d0b57d');
  box('Clockmaker tool roll',[-9,1.95,-8.8],[3.6,.12,.5],'#586967');
  for(let i=0;i<5;i++)box('Fine hand tool',[-10.3+i*.6,2.06,-8.8],[.12,.12,.75],'#c7b78c');
  cylinder('Workshop stool',[-9,.7,-5.5],[1.5,1.4,1.5],'#615f4c');
  cylinder('Stool cushion',[-9,1.45,-5.5],[1.6,.2,1.6],'#9e8966');
  bookcase(8,-13.5);
  for(const x of [-11,11]) planter(x,10,1.2);
  for(let i=0;i<4;i++) {
    box('Parts cabinet drawer',[11, .65+i*.9,-4],[2.6,.75,3],'#8d7353');
    box('Brass drawer pull',[9.62,.65+i*.9,-4],[.12,.15,.8],'#cbb178');
  }
  bench(-10,5,Math.PI/2);
  for(let i=0;i<6;i++) {
    const a=i*Math.PI/3;
    box('Dais brass inlay',[Math.cos(a)*5.4,.57,Math.sin(a)*5.4],[.18,.12,1.2],'#e2c684',a);
  }
  // A tall clock face built from a shallow vertical cylinder is unavailable, so use a framed dial mosaic.
  box('Clock case',[ -8,3.5,-13.6],[4.2,6,1.3],'#6c5945');
  box('Ivory clock face',[-8,4.6,-12.88],[3.4,2.6,.12],'#d9caa5');
  box('Clock minute hand',[-8,4.9,-12.77],[.13,1.2,.1],'#555f55');
  box('Clock hour hand',[-7.65,4.6,-12.75],[.8,.13,.1],'#555f55');
  sphere('Pendulum bob',[-8,1.8,-12.8],[.8,.8,.3],'#c3a368');
  const solar=finish('plot-1-2','A clockmaker’s brass workshop built around a slowly turning sun engine. Gear blanks, fine tools, parts drawers and a pendulum clock give the mechanism a working life. Walnut, linen and aged brass frame the warm moving centerpiece.');
  return [common,tidal,solar];
}
