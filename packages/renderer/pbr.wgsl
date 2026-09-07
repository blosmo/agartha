struct Pbr { tint:vec4f, roughness:f32, metalness:f32, shape:f32, opacity:f32, alphaEnabled:f32, alphaCutoff:f32, flipY:f32, unlit:f32, aoIntensity:f32, normalScale:vec2f, uvSets:vec4f, emission:vec3f, emissionUvSet:f32, albedoUv:mat3x3f, normalUv:mat3x3f, armUv:mat3x3f, aoUv:mat3x3f, emissionUv:mat3x3f }
@group(0) @binding(2) var albedoMap:texture_2d<f32>;
@group(0) @binding(3) var normalMap:texture_2d<f32>;
@group(0) @binding(4) var armMap:texture_2d<f32>;
@group(0) @binding(5) var albedoSampler:sampler;
@group(0) @binding(9) var normalSampler:sampler;
@group(0) @binding(10) var armSampler:sampler;
@group(0) @binding(11) var aoSampler:sampler;
@group(0) @binding(12) var emissiveSampler:sampler;
@group(0) @binding(6) var<uniform> pbr:Pbr;
@group(0) @binding(7) var aoMap:texture_2d<f32>;
@group(0) @binding(8) var emissiveMap:texture_2d<f32>;
fn surfaceUv(p:vec3f,n:vec3f)->vec2f {
  if(pbr.shape==1.0){return vec2f(0.5+atan2(p.z,p.x)/6.2831853,0.5-asin(clamp(p.y*2.0,-1.0,1.0))/3.1415927);}
  if(pbr.shape>1.0 && abs(n.y)<0.9){return vec2f(0.5+atan2(p.z,p.x)/6.2831853,0.5-p.y);}
  if(abs(n.y)>=max(abs(n.x),abs(n.z))){return vec2f(p.x+0.5,0.5-p.z);}
  if(abs(n.x)>abs(n.z)){return vec2f(0.5-p.z*sign(n.x),0.5-p.y);}
  return vec2f(p.x*sign(n.z)+0.5,0.5-p.y);
}
fn materialUv(input:VertexOut,channel:f32,transform:mat3x3f)->vec2f {
  var uv=surfaceUv(input.surfacePosition,input.surfaceNormal);
  if(pbr.shape<0.0){uv=select(input.uv,input.uv1,channel>0.5);uv=(transform*vec3f(uv,1.0)).xy;if(pbr.flipY>0.5){uv.y=1.0-uv.y;}}
  return uv;
}
fn pbrShade(input:VertexOut,front:bool)->vec4f {
  let uv=materialUv(input,pbr.uvSets.y,pbr.normalUv);
  let sample=textureSample(albedoMap,albedoSampler,materialUv(input,pbr.uvSets.x,pbr.albedoUv));
  let alpha=select(1.0,sample.a*pbr.opacity*input.alpha,pbr.alphaEnabled>0.5);
  let base=sample.rgb*input.color*pbr.tint.rgb;
  let arm=textureSample(armMap,armSampler,materialUv(input,pbr.uvSets.z,pbr.armUv)).rgb;
  let ao=mix(1.0,textureSample(aoMap,aoSampler,materialUv(input,pbr.uvSets.w,pbr.aoUv)).r,pbr.aoIntensity);
  let emission=textureSample(emissiveMap,emissiveSampler,materialUv(input,pbr.emissionUvSet,pbr.emissionUv)).rgb*pbr.emission;
  let mapped=textureSample(normalMap,normalSampler,uv).xyz*2.0-1.0;
  let q0=dpdx(input.worldPosition);let q1=dpdy(input.worldPosition);
  let s0=dpdx(uv);let s1=dpdy(uv);
  let tangent=q0*s1.y-q1*s0.y;let bitangent=-q0*s1.x+q1*s0.x;
  let n0=normalize(input.normal)*select(-1.0,1.0,front);
  let inv=inverseSqrt(max(max(dot(tangent,tangent),dot(bitangent,bitangent)),0.00001));
  let n=normalize(tangent*inv*mapped.x*pbr.normalScale.x+bitangent*inv*mapped.y*pbr.normalScale.y+n0*mapped.z);
  let v=normalize(camera.viewDirection);let l=normalize(vec3f(-0.5,1.0,0.4));let h=normalize(v+l);
  let nv=max(dot(n,v),0.001);let nl=max(dot(n,l),0.0);let nh=max(dot(n,h),0.0);let vh=max(dot(v,h),0.0);
  let rough=max(0.08,arm.g*pbr.roughness);let metal=arm.b*pbr.metalness;
  let color=agarthaShade(input.surfacePosition,input.surfaceNormal,base,camera.time);
  if(pbr.unlit>0.5){if(alpha<pbr.alphaCutoff){discard;}return vec4f(pow(clamp(color,vec3f(0.0),vec3f(1.0)),vec3f(1.0/2.2)),alpha);}
  if(alpha<pbr.alphaCutoff){discard;}
  let f0=mix(vec3f(0.04),color,metal);let f=f0+(vec3f(1.0)-f0)*pow(1.0-vh,5.0);
  let a=rough*rough;let a2=a*a;let denom=nh*nh*(a2-1.0)+1.0;
  let d=a2/(3.1415927*denom*denom+0.00001);
  let k=(rough+1.0)*(rough+1.0)/8.0;
  let g=(nv/(nv*(1.0-k)+k))*(nl/(nl*(1.0-k)+k));
  let spec=d*g*f/(4.0*nv*max(nl,0.001));
  let diffuse=(vec3f(1.0)-f)*(1.0-metal)*color/3.1415927;
  let lit=(diffuse+spec)*nl*2.6+color*0.48*ao+f0*0.28+emission;
  return vec4f(pow(clamp(lit,vec3f(0.0),vec3f(1.0)),vec3f(1.0/2.2)),alpha);
}
