export type SurfaceProgram = { expression:string; wgsl:string; glsl:string; usesTime:boolean };
type Dimension = 1 | 2 | 3;
type Node = { dimension:Dimension; wgsl:string; glsl:string };
const variables:Record<string,Dimension> = {position:3,normal:3,color:3,time:1};
const unary = new Set(['sin','cos','abs','fract','floor','ceil','sqrt']);
const binary = new Set(['min','max','pow','step']);
const ternary = new Set(['mix','clamp','smoothstep']);
const hashWGSL = `fn agarthaHash(p:vec3f)->f32{return fract(sin(dot(p,vec3f(12.9898,78.233,37.719)))*43758.5453);}
fn agarthaNoise(p:vec3f)->f32{let i=floor(p);let f=fract(p);let u=f*f*(vec3f(3.0)-2.0*f);return mix(mix(mix(agarthaHash(i),agarthaHash(i+vec3f(1.0,0.0,0.0)),u.x),mix(agarthaHash(i+vec3f(0.0,1.0,0.0)),agarthaHash(i+vec3f(1.0,1.0,0.0)),u.x),u.y),mix(mix(agarthaHash(i+vec3f(0.0,0.0,1.0)),agarthaHash(i+vec3f(1.0,0.0,1.0)),u.x),mix(agarthaHash(i+vec3f(0.0,1.0,1.0)),agarthaHash(i+vec3f(1.0,1.0,1.0)),u.x),u.y),u.z);}`;
const hashGLSL = `float agarthaHash(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);}
float agarthaNoise(vec3 p){vec3 i=floor(p);vec3 f=fract(p);vec3 u=f*f*(vec3(3.0)-2.0*f);return mix(mix(mix(agarthaHash(i),agarthaHash(i+vec3(1.0,0.0,0.0)),u.x),mix(agarthaHash(i+vec3(0.0,1.0,0.0)),agarthaHash(i+vec3(1.0,1.0,0.0)),u.x),u.y),mix(mix(agarthaHash(i+vec3(0.0,0.0,1.0)),agarthaHash(i+vec3(1.0,0.0,1.0)),u.x),mix(agarthaHash(i+vec3(0.0,1.0,1.0)),agarthaHash(i+vec3(1.0,1.0,1.0)),u.x),u.y),u.z);}`;

/** Parse a small typed expression language; emit shader code only from validated nodes. */
export function compileSurface(expression:string):SurfaceProgram {
  if(typeof expression!=='string'||!expression.trim()||expression.length>1200)throw new Error('Use a surface expression of 1–1,200 characters.');
  const tokens:string[]=[];const pattern=/\s*(\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|[A-Za-z_][A-Za-z_0-9]*|[()+\-*/,.])/y;
  let offset=0;
  while(offset<expression.length){if(!expression.slice(offset).trim())break;pattern.lastIndex=offset;const match=pattern.exec(expression);if(!match)throw new Error('Use only surface math expressions, without statements or shader declarations.');tokens.push(match[1]);offset=pattern.lastIndex;if(tokens.length>256)throw new Error('Surface expression is too complex.');}
  let cursor=0,nodes=0,depth=0,noiseCalls=0,usesTime=false;
  const peek=()=>tokens[cursor];
  const take=(expected?:string)=>{const token=tokens[cursor++];if(!token||(expected&&token!==expected))throw new Error(`Expected ${expected??'a value'}.`);return token;};
  const node=(dimension:Dimension,wgsl:string,glsl=wgsl):Node=>{if(++nodes>128)throw new Error('Surface expression is too complex.');return {dimension,wgsl,glsl};};
  const cast=(n:Node,dimension:Dimension):Node=>{if(n.dimension===dimension)return n;if(n.dimension!==1)throw new Error('Vector sizes must match.');return {dimension,wgsl:`vec${dimension}f(${n.wgsl})`,glsl:`vec${dimension}(${n.glsl})`};};
  function call(name:string,args:Node[]):Node {
    if(name==='vec2f'||name==='vec3f'){
      const dimension=Number(name[3]) as Dimension;
      if(!((args.length===1&&args[0].dimension===1)||args.reduce((sum,a)=>sum+a.dimension,0)===dimension))throw new Error(`${name} needs ${dimension} components.`);
      return node(dimension,`${name}(${args.map(a=>a.wgsl).join(',')})`,`${name.replace('f','')}(${args.map(a=>a.glsl).join(',')})`);
    }
    if(name==='noise'){
      if(args.length!==1||args[0].dimension!==3||++noiseCalls>4)throw new Error('Use noise(vec3f), at most four times.');
      return node(1,`agarthaNoise(${args[0].wgsl})`,`agarthaNoise(${args[0].glsl})`);
    }
    if(name==='dot'){
      if(args.length!==2||args[0].dimension===1||args[0].dimension!==args[1].dimension)throw new Error('dot needs two vectors of the same size.');
      return node(1,`dot(${args.map(a=>a.wgsl).join(',')})`,`dot(${args.map(a=>a.glsl).join(',')})`);
    }
    if(name==='length'||name==='normalize'){
      if(args.length!==1||args[0].dimension===1)throw new Error(`${name} needs one vector.`);
      return node(name==='length'?1:args[0].dimension,`${name}(${args[0].wgsl})`,`${name}(${args[0].glsl})`);
    }
    const arity=unary.has(name)?1:binary.has(name)?2:ternary.has(name)?3:0;
    if(!arity||args.length!==arity)throw new Error(`Unsupported function or argument count: ${name}.`);
    const dimension=Math.max(...args.map(a=>a.dimension)) as Dimension;
    const values=args.map(a=>cast(a,dimension));
    return node(dimension,`${name}(${values.map(a=>a.wgsl).join(',')})`,`${name}(${values.map(a=>a.glsl).join(',')})`);
  }
  function atom():Node {
    if(++depth>16)throw new Error('Surface expression is nested too deeply.');
    let result:Node;const token=take();
    if(token==='('){result=expressionNode();take(')');}
    else if(token==='-'||token==='+'){const value=atom();result=token==='+'?value:node(value.dimension,`(-${value.wgsl})`,`(-${value.glsl})`);}
    else if(/^\d|^\.\d/.test(token)){
      const number=Number(token);if(!Number.isFinite(number)||Math.abs(number)>10000)throw new Error('Use finite constants between -10,000 and 10,000.');
      const literal=number.toString();result=node(1,/[.e]/i.test(literal)?literal:`${literal}.0`);
    } else if(peek()==='('){take('(');const args:Node[]=[];if(peek()!==')'){do{args.push(expressionNode());if(peek()!==',')break;take(',');}while(true);}take(')');result=call(token,args);}
    else if(Object.hasOwn(variables,token)){if(token==='time')usesTime=true;result=node(variables[token],token);}
    else throw new Error(`Unknown surface value: ${token}.`);
    while(peek()==='.'){
      take('.');const fields=take();if(!/^[xyz]{1,3}$|^[rgb]{1,3}$/.test(fields)||result.dimension===1||[...fields].some(c=>('xyz'.includes(c)?'xyz':'rgb').indexOf(c)>=result.dimension))throw new Error('Invalid vector components.');
      result=node(fields.length as Dimension,`(${result.wgsl}).${fields.replaceAll('r','x').replaceAll('g','y').replaceAll('b','z')}`,`(${result.glsl}).${fields}`);
    }
    depth--;return result;
  }
  function combine(a:Node,operator:string,b:Node){const dimension=Math.max(a.dimension,b.dimension) as Dimension;const left=cast(a,dimension),right=cast(b,dimension);return node(dimension,`(${left.wgsl}${operator}${right.wgsl})`,`(${left.glsl}${operator}${right.glsl})`);}
  function product():Node{let result=atom();while(peek()==='*'||peek()==='/'){const operator=take();result=combine(result,operator,atom());}return result;}
  function expressionNode():Node{let result=product();while(peek()==='+'||peek()==='-'){const operator=take();result=combine(result,operator,product());}return result;}
  const result=expressionNode();if(cursor!==tokens.length)throw new Error('Unexpected surface expression input.');if(result.dimension!==3)throw new Error('A surface shader must return a vec3f RGB color.');
  return {expression:expression.trim(),usesTime,wgsl:`${noiseCalls?hashWGSL:''}\nfn agarthaShade(position:vec3f,normal:vec3f,color:vec3f,time:f32)->vec3f{return clamp(${result.wgsl},vec3f(0.0),vec3f(1.0));}`,glsl:`${noiseCalls?hashGLSL:''}\nvec3 agarthaShade(vec3 position,vec3 normal,vec3 color,float time){return clamp(${result.glsl},vec3(0.0),vec3(1.0));}`};
}
export const SURFACE_EXAMPLES = [
  {name:'Moss grain',expression:'mix(color, vec3f(0.18, 0.38, 0.22), noise(position * 8.0) * 0.7)'},
  {name:'Mineral bands',expression:'mix(color, vec3f(0.85, 0.68, 0.42), 0.5 + 0.5 * sin(position.y * 24.0))'},
  {name:'Oxidized bronze',expression:'mix(color, vec3f(0.12, 0.42, 0.34), smoothstep(0.35, 0.65, noise(position * 7.0)))'},
  {name:'Lapis veins',expression:'mix(vec3f(0.025, 0.11, 0.28), vec3f(0.85, 0.66, 0.3), pow(0.5 + 0.5 * sin(position.y * 20.0 + noise(position * 5.0) * 8.0), 12.0))'},
  {name:'Water caustics',expression:'color + vec3f(0.18, 0.24, 0.2) * pow(0.5 + 0.5 * sin(position.x * 22.0 + sin(position.z * 18.0 + time) * 2.0 - time), 8.0)'},
  {name:'Opal shimmer',expression:'mix(color, vec3f(0.4, 0.75, 0.7), 0.25 + 0.2 * sin(time * 0.5 + position.y * 9.0 + noise(position * 4.0) * 5.0))'},
  {name:'Sandstone strata',expression:'mix(color, vec3f(0.55, 0.36, 0.2), 0.2 + 0.25 * sin(position.y * 35.0 + noise(position * 5.0) * 3.0))'},
  {name:'Ember glow',expression:'mix(vec3f(0.3, 0.055, 0.018), vec3f(0.95, 0.43, 0.08), noise(position * 6.0 + vec3f(0.0, time * 0.3, 0.0)))'},
  {name:'Quiet pulse',expression:'color * (0.7 + 0.3 * sin(time + position.y * 4.0))'},
] as const;
export const SURFACE_CAPABILITIES = {
  inputs:{position:'Object-local vec3f',normal:'Object-local vec3f',color:'Base RGB vec3f',time:'Seconds; animation is opt-in and disabled by reduced motion'},
  functions:['vec2f','vec3f','sin','cos','abs','fract','floor','ceil','sqrt','min','max','pow','step','mix','clamp','smoothstep','dot','length','normalize','noise'],
  limits:{characters:1200,nodes:128,nesting:16,noiseCalls:4},
  output:'A vec3f RGB color. The same validated expression is compiled to WGSL and GLSL.',
};
