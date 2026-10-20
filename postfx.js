// postfx.js — a compact bloom pass. Renders the scene to a target, extracts the
// bright parts, blurs them at half resolution and adds them back on composite.
import * as THREE from 'three';

const QUAD_VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const BRIGHT_FRAG = `
uniform sampler2D tDiffuse;
uniform float threshold;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = max(0.0, l - threshold) / max(l, 1e-4);
  gl_FragColor = vec4(c * k, 1.0);
}
`;

const BLUR_FRAG = `
uniform sampler2D tDiffuse;
uniform vec2 dir;          // texel-sized step
varying vec2 vUv;
void main() {
  vec3 sum = texture2D(tDiffuse, vUv).rgb * 0.227027;
  sum += texture2D(tDiffuse, vUv + dir * 1.3846).rgb * 0.316216;
  sum += texture2D(tDiffuse, vUv - dir * 1.3846).rgb * 0.316216;
  sum += texture2D(tDiffuse, vUv + dir * 3.2308).rgb * 0.070270;
  sum += texture2D(tDiffuse, vUv - dir * 3.2308).rgb * 0.070270;
  gl_FragColor = vec4(sum, 1.0);
}
`;

const COMPOSITE_FRAG = `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform sampler2D tPrev;      // last frame, for motion blur
uniform sampler2D tBlur;      // half-res blur, for depth of field
uniform float strength;
uniform float motion;         // 0..1 how much to smear the previous frame
uniform float dof;            // 0..1 how much edge softening
uniform vec2 dofCentre;
uniform float grain;          // 0..1 film grain
uniform float time;
uniform float wet;            // 0..1 how wet the ground is
varying vec2 vUv;

void main() {
  vec4 scene = texture2D(tScene, vUv);

  // depth of field: blend in the blurred copy away from the focal centre
  if (dof > 0.001) {
    vec3 soft = texture2D(tBlur, vUv).rgb;
    float d = distance(vUv, dofCentre) * 1.6;
    float k = clamp(d * dof, 0.0, 0.85);
    scene.rgb = mix(scene.rgb, soft, k);
  }

  // motion blur: blend toward the previous frame
  if (motion > 0.001) {
    vec3 prev = texture2D(tPrev, vUv).rgb;
    scene.rgb = mix(scene.rgb, prev, motion);
  }

  vec3 bloom = texture2D(tBloom, vUv).rgb;
  vec3 outCol = scene.rgb + bloom * strength;

  // wet ground: a planar reflection mirrored about the horizon. This is the
  // cheap cousin of screen-space reflections — one blurred fetch, no raymarch.
  if (wet > 0.001 && vUv.y < 0.6) {
    vec2 ruv = vec2(vUv.x, clamp(0.58 + (0.58 - vUv.y) * 0.75, 0.0, 1.0));
    vec3 refl = texture2D(tBlur, ruv).rgb;
    float k = wet * 0.32 * smoothstep(0.6, 0.15, vUv.y);
    outCol = mix(outCol, refl, k);
  }

  // film grain — a cheap hash, animated so it flickers like real grain
  if (grain > 0.001) {
    float n = fract(sin(dot(vUv * vec2(1234.5, 6789.1) + time, vec2(12.9898, 78.233))) * 43758.5453);
    outCol += (n - 0.5) * grain;
  }

  gl_FragColor = vec4(outCol, 1.0);
  #include <colorspace_fragment>
}
`;

const RAYS_FRAG = `
uniform sampler2D tDiffuse;
uniform vec2 sunPos;      // sun in uv space
uniform float density;
uniform float decay;
uniform float weight;
uniform float exposure;
varying vec2 vUv;
void main() {
  vec2 delta = (vUv - sunPos) * (density / 24.0);
  vec2 uv = vUv;
  vec3 sum = vec3(0.0);
  float illum = 1.0;
  for (int i = 0; i < 24; i++) {
    uv -= delta;
    sum += texture2D(tDiffuse, uv).rgb * illum * weight;
    illum *= decay;
  }
  gl_FragColor = vec4(sum * exposure, 1.0);
}
`;

const RAYS_ADD_FRAG = `
uniform sampler2D tScene;
uniform sampler2D tRays;
uniform float strength;
varying vec2 vUv;
void main() {
  vec3 base = texture2D(tScene, vUv).rgb;
  vec3 rays = texture2D(tRays, vUv).rgb;
  gl_FragColor = vec4(base + rays * strength, 1.0);
  #include <colorspace_fragment>
}
`;

export class Bloom {
  constructor(renderer, strength = 0.85, threshold = 0.72) {
    this.renderer = renderer;
    this.enabled = true;
    this.strength = strength;
    this.threshold = threshold;
    this.supported = true;

    const opts = { type: THREE.HalfFloatType, depthBuffer: true, stencilBuffer: false };
    this.rtScene = new THREE.WebGLRenderTarget(2, 2, opts);
    this.rtA = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: false });
    this.rtB = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: false });
    this.rtC = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: false });
    this.rtPrev = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: false });
    this.motion = 0;
    this.dof = 0;
    this.grain = 0;
    this.wet = 0;
    this._hasPrev = false;

    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);

    this.matBright = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, threshold: { value: threshold } },
      vertexShader: QUAD_VERT, fragmentShader: BRIGHT_FRAG, depthTest: false, depthWrite: false,
    });
    this.matBlur = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, dir: { value: new THREE.Vector2() } },
      vertexShader: QUAD_VERT, fragmentShader: BLUR_FRAG, depthTest: false, depthWrite: false,
    });
    this.matRays = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, sunPos: { value: new THREE.Vector2(0.5, 0.7) },
        density: { value: 0.9 }, decay: { value: 0.94 }, weight: { value: 0.5 }, exposure: { value: 0.34 } },
      vertexShader: QUAD_VERT, fragmentShader: RAYS_FRAG,
    });
    this.matRaysAdd = new THREE.ShaderMaterial({
      uniforms: { tScene: { value: null }, tRays: { value: null }, strength: { value: 1 } },
      vertexShader: QUAD_VERT, fragmentShader: RAYS_ADD_FRAG,
    });
    this.raysStrength = 1.0;
    this.sunUv = new THREE.Vector2(0.5, 0.7);
    this.matComposite = new THREE.ShaderMaterial({
      uniforms: { tScene: { value: null }, tBloom: { value: null }, tPrev: { value: null },
        tBlur: { value: null }, strength: { value: strength }, motion: { value: 0 },
        dof: { value: 0 }, dofCentre: { value: new THREE.Vector2(0.5, 0.5) },
        grain: { value: 0 }, time: { value: 0 }, wet: { value: 0 } },
      vertexShader: QUAD_VERT, fragmentShader: COMPOSITE_FRAG, depthTest: false, depthWrite: false,
    });
  }

  setSize(w, h) {
    const r = this.renderer.getPixelRatio();
    this.rtScene.setSize(Math.max(2, w * r), Math.max(2, h * r));
    const hw = Math.max(2, (w * r) * 0.5), hh = Math.max(2, (h * r) * 0.5);
    this.rtA.setSize(hw, hh);
    this.rtB.setSize(hw, hh);
    this.rtC.setSize(hw, hh);
    this.rtPrev.setSize(hw, hh);
    this.rtB.setSize(hw, hh);
  }

  _pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.clear();
    this.renderer.render(this.quadScene, this.quadCam);
  }

  render(scene, camera) {
    const r = this.renderer;
    r.setRenderTarget(this.rtScene);
    r.clear();
    r.render(scene, camera);

    // bright pass -> half res
    this.matBright.uniforms.tDiffuse.value = this.rtScene.texture;
    this.matBright.uniforms.threshold.value = this.threshold;
    this._pass(this.matBright, this.rtA);

    // separable blur
    const w = this.rtA.width, h = this.rtA.height;
    this.matBlur.uniforms.tDiffuse.value = this.rtA.texture;
    this.matBlur.uniforms.dir.value.set(1 / w, 0);
    this._pass(this.matBlur, this.rtB);
    this.matBlur.uniforms.tDiffuse.value = this.rtB.texture;
    this.matBlur.uniforms.dir.value.set(0, 1 / h);
    this._pass(this.matBlur, this.rtA);

    // god rays: radial blur of the bright pass toward the sun
    let sceneTex = this.rtScene.texture;
    if (this.raysStrength > 0.01) {
      this.matRays.uniforms.tDiffuse.value = this.rtA.texture;
      this.matRays.uniforms.sunPos.value.copy(this.sunUv);
      this._pass(this.matRays, this.rtB);
      this.matRaysAdd.uniforms.tScene.value = this.rtScene.texture;
      this.matRaysAdd.uniforms.tRays.value = this.rtB.texture;
      this.matRaysAdd.uniforms.strength.value = this.raysStrength;
      this._pass(this.matRaysAdd, this.rtC);
      sceneTex = this.rtC.texture;
    }

    // composite to the canvas, with motion blur and depth of field folded in
    const u = this.matComposite.uniforms;
    u.tScene.value = sceneTex;
    u.tBloom.value = this.rtA.texture;
    u.strength.value = this.strength;
    u.tBlur.value = this.rtB.texture;      // the half-res blur from the bloom chain
    u.dof.value = this.dof;
    u.motion.value = this._hasPrev ? this.motion : 0;
    u.tPrev.value = this.rtPrev.texture;
    r.setRenderTarget(null);
    r.clear();
    this._pass(this.matComposite, null);

    // keep this frame for the next one's motion blur
    this.matBlur.uniforms.tDiffuse.value = sceneTex;
    this.matBlur.uniforms.dir.value.set(1 / this.rtPrev.width, 0);
    this._pass(this.matBlur, this.rtPrev);
    this._hasPrev = true;
  }

  dispose() {
    for (const t of [this.rtScene, this.rtA, this.rtB]) t.dispose();
    this.quad.geometry.dispose();
    for (const m of [this.matBright, this.matBlur, this.matComposite]) m.dispose();
  }
}
