// particles.js — pooled GPU point system for blood, sparks, dust
import * as THREE from 'three';

const VERT = `
attribute float size; attribute float alpha; attribute vec3 pcolor;
varying float vAlpha; varying vec3 vColor;
void main(){
  vAlpha = alpha; vColor = pcolor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (320.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
varying float vAlpha; varying vec3 vColor;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = vAlpha * smoothstep(0.5, 0.1, d);
  gl_FragColor = vec4(vColor, a);
}`;

class System {
  constructor(scene, count, blending) {
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    this.size = new Float32Array(count);
    this.alpha = new Float32Array(count);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);
    this.grav = new Float32Array(count);
    this.head = 0;

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    const m = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, blending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.geo = g;
  }

  emit(x, y, z, opts) {
    const i = this.head; this.head = (this.head + 1) % this.count;
    const s = opts.spread ?? 2.5;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = (Math.random() - .5) * s + (opts.vx || 0);
    this.vel[i * 3 + 1] = (Math.random() - .5) * s + (opts.vy || 0);
    this.vel[i * 3 + 2] = (Math.random() - .5) * s + (opts.vz || 0);
    const c = opts.color;
    this.col[i * 3] = c[0]; this.col[i * 3 + 1] = c[1]; this.col[i * 3 + 2] = c[2];
    this.size[i] = opts.size ?? 0.15;
    this.alpha[i] = 1;
    this.life[i] = this.maxLife[i] = opts.life ?? 0.6;
    this.grav[i] = opts.gravity ?? 6;
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) { this.alpha[i] = 0; any = true; } continue; }
      any = true;
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alpha[i] = Math.max(0, this.life[i] / this.maxLife[i]);
    }
    if (any) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.alpha.needsUpdate = true;
      this.geo.attributes.pcolor.needsUpdate = true;
      this.geo.attributes.size.needsUpdate = true;
    }
  }
}

export class Particles {
  constructor(scene) {
    this.blood = new System(scene, 400, THREE.NormalBlending);
    this.spark = new System(scene, 400, THREE.AdditiveBlending);
  }
  bloodBurst(p, n = 10) {
    for (let i = 0; i < n; i++) this.blood.emit(p.x, p.y, p.z,
      { color: [0.55, 0.03, 0.05], spread: 3.2, size: 0.22, life: 0.5, gravity: 9 });
  }
  smoke(p, n = 3) {
    for (let i = 0; i < n; i++) this.blood.emit(p.x, p.y, p.z,
      { color: [0.72, 0.72, 0.74], spread: 0.5, vy: 0.9, size: 0.16, life: 1.1, gravity: -0.4 });
  }
  casing(p, dir) {
    for (let i = 0; i < 2; i++) this.spark.emit(p.x, p.y, p.z,
      { color: [0.95, 0.82, 0.4], spread: 1.6, vy: 2.2, size: 0.05, life: 0.9, gravity: 12 });
  }
  /* blood that sprays along the bullet's path */
  bloodSpurt(p, dir, n = 8) {
    for (let i = 0; i < n; i++) {
      const d = dir || { x: 0, y: 0, z: 0 };
      this.blood.emit(p.x, p.y, p.z, {
        color: [0.62, 0.08, 0.08], spread: 0.5,
        vx: d.x * 3 + (Math.random() - .5) * 2,
        vy: d.y * 2 + Math.random() * 1.6,
        vz: d.z * 3 + (Math.random() - .5) * 2,
        size: 0.09, life: 0.8, gravity: 9,
      });
    }
  }

  impact(p, n = 6, c = [1, 0.85, 0.5]) {
    for (let i = 0; i < n; i++) this.spark.emit(p.x, p.y, p.z,
      { color: c, spread: 2.6, size: 0.1, life: 0.25, gravity: 4 });
  }
  rain(p, n = 8) {
    for (let i = 0; i < n; i++) {
      this.blood.emit(p.x + (Math.random() - .5) * 46, p.y + 15 + Math.random() * 12,
        p.z + (Math.random() - .5) * 46,
        { color: [0.62, 0.72, 0.9], spread: 0.4, vy: -26, size: 0.09, life: 0.7, gravity: 0 });
    }
  }
  leaves(p, n = 2) {
    for (let i = 0; i < n; i++) {
      this.blood.emit(p.x + (Math.random() - .5) * 26, p.y + 3 + Math.random() * 6,
        p.z + (Math.random() - .5) * 26,
        { color: [0.34 + Math.random() * 0.18, 0.5, 0.24], spread: 0.7, vy: -0.7, size: 0.18, life: 2.4, gravity: 0.4 });
    }
  }
  explosion(p, n = 40) {
    for (let i = 0; i < n; i++) this.spark.emit(p.x, p.y, p.z,
      { color: [1, 0.6 + Math.random() * 0.3, 0.2], spread: 8, size: 0.3, life: 0.6, gravity: 8 });
    for (let i = 0; i < n / 2; i++) this.blood.emit(p.x, p.y, p.z,
      { color: [0.2, 0.2, 0.22], spread: 4, size: 0.5, life: 1.1, gravity: 1 });
  }
  update(dt) { this.blood.update(dt); this.spark.update(dt); }
}
