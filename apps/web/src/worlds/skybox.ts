import * as THREE from 'three';

/** A static atmospheric sky: twelve triangles, no textures or network requests. */
export function createSkybox() {
  const sky = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, toneMapped: false,
    uniforms: {
      zenith: { value: new THREE.Color('#789fb9') },
      horizon: { value: new THREE.Color('#dee8df') },
      nadir: { value: new THREE.Color('#9fb9b8') },
      sunlight: { value: new THREE.Color('#fff2d5') },
      sunDirection: { value: new THREE.Vector3(-.5, .7, .3).normalize() },
    },
    vertexShader: `varying vec3 skyDirection;
      void main() { skyDirection = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec3 skyDirection;
      uniform vec3 zenith; uniform vec3 horizon; uniform vec3 nadir; uniform vec3 sunlight;
      uniform vec3 sunDirection;
      void main() {
        vec3 direction = normalize(skyDirection);
        vec3 color = mix(horizon, zenith, smoothstep(0.0, 0.85, direction.y));
        color = mix(color, nadir, smoothstep(0.0, 0.8, -direction.y));
        float sun = max(0.0, dot(direction, normalize(sunDirection)));
        color = mix(color, sunlight, 0.18 * pow(sun, 16.0) + 0.65 * pow(sun, 1800.0));
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  sky.name = 'Atmospheric skybox';
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  return sky;
}
