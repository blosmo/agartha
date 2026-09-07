// AGARTHA_SURFACE_SHADER_START
fn agarthaShade(position:vec3f,normal:vec3f,color:vec3f,time:f32)->vec3f{return color;}
// AGARTHA_SURFACE_SHADER_END
struct Camera { viewProjection: mat4x4f, time: f32, viewDirection: vec3f }
struct Instance { position: vec4f, scale: vec4f, color: vec4f }
@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<storage, read> instances: array<Instance>;
struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) color: vec3f,
  @location(2) surfacePosition: vec3f,
  @location(3) surfaceNormal: vec3f,
  @location(4) worldPosition: vec3f,
  @location(5) uv:vec2f,
  @location(6) uv1:vec2f,
  @location(7) alpha:f32,
}
@vertex fn vs_main(@location(0) position: vec3f, @location(1) normal: vec3f, // MESH_UV_INPUT
 @builtin(instance_index) id: u32) -> VertexOut {
  let item = instances[id];
  var result: VertexOut;
  let c = cos(item.position.w);
  let s = sin(item.position.w);
  let p = position * item.scale.xyz;
  let n = normal / item.scale.xyz;
  let rotated = vec3f(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  result.worldPosition = rotated + item.position.xyz;
  result.position = camera.viewProjection * vec4f(rotated + item.position.xyz, 1.0);
  result.normal = normalize(vec3f(c * n.x + s * n.z, n.y, -s * n.x + c * n.z));
  result.uv = position.xy + vec2f(0.5);
  result.uv1 = result.uv;
  result.color = item.color.xyz;
  result.alpha = 1.0;
  result.surfacePosition = position;
  result.surfaceNormal = normal;
  return result;
}
// AGARTHA_PBR
@fragment fn fs_main(input: VertexOut, @builtin(front_facing) front:bool) -> @location(0) vec4f {
  let sun = max(dot(normalize(input.normal), normalize(vec3f(-0.5, 1.0, 0.4))), 0.0);
  let light = 0.55 + sun * 0.45;
  return vec4f(agarthaShade(input.surfacePosition, input.surfaceNormal, input.color, camera.time) * light, 1.0);
}
