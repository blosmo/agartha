/** Shared cutaway architecture used by the viewer and agent PNGs. */
export interface RoomShellPart { id:string; name:string; shape:'box'; position:[number,number,number]; scale:[number,number,number]; color:string; author:string }
const palettes=[['#9caeae','#c0cecb','#527f82'],['#b7ad99','#ded5bd','#a37354'],['#a3a4b5','#d0cede','#77668c'],['#a4b39d','#d1dcc7','#62836a']];
export function roomShell(x:number,z:number,empty=false):RoomShellPart[]{
  const [floor,wall,accent]=palettes[((x*7+z*3)%palettes.length+palettes.length)%palettes.length];
  const blend=(a:string,b:string,t:number)=>'#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('');
  const joint=blend(floor,accent,.24);
  const parts:RoomShellPart[]=[];
  function box(id:string,position:RoomShellPart['position'],scale:RoomShellPart['scale'],color:string){parts.push({id,name:'Room architecture',shape:'box',position,scale,color,author:'Agartha architecture'});}
  box('floor',[0,-.55,0],[32,1,32],empty?'#53636a':floor);
  if(empty){for(const s of [-1,1]){box(`edge-x-${s}`,[s*15.9,0,0],[.1,.1,32],'#798989');box(`edge-z-${s}`,[0,0,s*15.9],[32,.1,.1],'#798989');}return parts;}
  for(let i=-12;i<=12;i+=4){box(`tile-x-${i}`,[i,-.035,0],[.1,.1,32],joint);box(`tile-z-${i}`,[0,-.035,i],[32,.1,.1],joint);}
  for(const axis of ['x','z']){
    const pos=(along:number,y:number):RoomShellPart['position']=>axis==='x'?[-15.8,y,along]:[along,y,-15.8];
    const size=(along:number,height:number,depth:number):RoomShellPart['scale']=>axis==='x'?[depth,height,along]:[along,height,depth];
    for(const side of [-1,1]){
      // Stop at the doorway post and reserve the shared corner for one corner block.
      const end=side<0?15.6:16,start=2.8,length=end-start,center=side*(start+end)/2;
      box(`${axis}-base-${side}`,pos(center,.12),size(length,.24,.35),accent);
      box(`${axis}-wall-${side}`,pos(center,.61),size(length,.74,.2),wall);
      box(`${axis}-cap-${side}`,pos(center,1.04),size(length,.12,.4),'#edf0df');
      box(`${axis}-threshold-post-${side}`,pos(side*2.65,.6),size(.3,1.2,.4),accent);
    }
  }
  box('corner-post',[-15.8,.55,-15.8],[.4,1.1,.4],accent);
  return parts;
}
