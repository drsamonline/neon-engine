// sky.js — gradient sky dome with a sun disc, halo and night stars
import * as THREE from 'three';

const VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = `
uniform vec3 topColor;
uniform vec3 horizonColor;
uniform vec3 groundColor;
uniform vec3 sunColor;
uniform vec3 sunDir;
uniform float night;
varying vec3 vDir;

float hash(vec3 p) {
  return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
}

void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y;

  vec3 col = mix(horizonColor, topColor, pow(clamp(h, 0.0, 1.0), 0.55));
  col = mix(col, groundColor, pow(clamp(-h, 0.0, 1.0), 0.5));

  // stars at night
  if (night > 0.01 && h > 0.0) {
    vec3 sp = floor(dir * 260.0);
    float s = hash(sp);
    float star = smoothstep(0.9975, 1.0, s) * night * (0.6 + 0.4 * hash(sp + 3.1));
    col += vec3(star);
  }

  // sun disc + halo
  float d = max(dot(dir, normalize(sunDir)), 0.0);
  col += sunColor * pow(d, 350.0) * 2.0;
  col += sunColor * pow(d, 12.0) * 0.35;
  col += sunColor * pow(d, 3.0) * 0.10;

  gl_FragColor = vec4(col, 1.0);
}`;

export class Sky {
  constructor(scene) {
    const geo = new THREE.SphereGeometry(1, 32, 20);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color('#3f6fb5') },
        horizonColor: { value: new THREE.Color('#bcd4ec') },
        groundColor: { value: new THREE.Color('#2a2f38') },
        sunColor: { value: new THREE.Color('#fff2dc') },
        sunDir: { value: new THREE.Vector3(0, 1, 0) },
        night: { value: 0 },
      },
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.scale.setScalar(600);   // inside the camera's far plane
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    scene.add(this.mesh);
    this._makeClouds(scene);
    this._makeMoon(scene);
  }

  /* a soft, scrolling cloud sheet above the world */
  _makeClouds(scene) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const ctx = c.getContext('2d');
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * 256, y = Math.random() * 256, r = 12 + Math.random() * 34;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    this.cloudMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false,
      opacity: 0.42, side: THREE.DoubleSide, fog: false });
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600), this.cloudMat);
    this.clouds.rotation.x = -Math.PI / 2;
    this.clouds.position.y = 230;
    this.clouds.renderOrder = -1;
    this.clouds.frustumCulled = false;
    scene.add(this.clouds);
    this.cloudT = 0;
  }

  /* a moon that rises opposite the sun and shows a phase through the month */
  _makeMoon(scene) {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 32),
      new THREE.MeshBasicMaterial({ color: '#f2f0e2', transparent: true, opacity: 0.9, fog: false, depthWrite: false }));
    const shade = new THREE.Mesh(new THREE.CircleGeometry(1, 32),
      new THREE.MeshBasicMaterial({ color: '#0b1018', transparent: true, opacity: 0.96, fog: false, depthWrite: false }));
    shade.position.z = 0.01;
    const g = new THREE.Group();
    g.add(disc); g.add(shade);
    g.scale.setScalar(26);
    g.frustumCulled = false;
    this.moonDisc = disc; this.moonShade = shade; this.moon = g;
    scene.add(g);
  }

  setMoonPhase(phase, sunDir, cameraPos, night) {
    if (!this.moon) return;
    // opposite the sun
    this.moon.position.set(cameraPos.x - sunDir.x * 420, 230 + Math.max(0, -sunDir.y) * 200, cameraPos.z - sunDir.z * 420);
    this.moon.lookAt(cameraPos.x, this.moon.position.y, cameraPos.z);
    const vis = night > 0.25 && sunDir.y < 0.15;
    this.moonDisc.material.opacity = vis ? 0.92 : 0;
    this.moonShade.material.opacity = vis ? 0.96 : 0;
    if (!vis) return;
    // slide the shadow disc across to carve the phase
    const p = phase * Math.PI * 2;
    this.moonShade.position.x = -Math.cos(p) * 2.05;
    this.moonShade.scale.setScalar(Math.abs(Math.sin(p)) < 0.02 ? 0.001 : 1);
  }

  update(cameraPos, sunDir, { top, horizon, ground, sun, night }) {
    this.mesh.position.copy(cameraPos);
    if (this.clouds) {
      this.cloudT = (this.cloudT || 0) + 0.008;
      if (this.cloudMat.map) this.cloudMat.map.offset.set(this.cloudT * 0.12, this.cloudT * 0.05);
      this.clouds.position.set(cameraPos.x, 230, cameraPos.z);
      this.cloudMat.opacity = 0.16 + 0.3 * (1 - night);
      this.cloudMat.color.setStyle(night > 0.5 ? '#26303f' : '#ffffff');
    }
    const u = this.mat.uniforms;
    u.topColor.value.copy(top);
    u.horizonColor.value.copy(horizon);
    u.groundColor.value.copy(ground);
    u.sunColor.value.copy(sun);
    u.sunDir.value.copy(sunDir);
    u.night.value = night;
  }
}
