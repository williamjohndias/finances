/**
 * Shader Background - WebGL animated background
 * Adaptado do Aceternity UI (animated-shader-hero) para vanilla JS
 */
(function () {
  'use strict';

  const defaultShaderSource = `#version 300 es
precision highp float;
out vec4 O;
uniform vec2 resolution;
uniform float time;
#define FC gl_FragCoord.xy
#define T time
#define R resolution
#define MN min(R.x,R.y)
float rnd(vec2 p) {
  p=fract(p*vec2(12.9898,78.233));
  p+=dot(p,p+34.56);
  return fract(p.x*p.y);
}
float noise(in vec2 p) {
  vec2 i=floor(p), f=fract(p), u=f*f*(3.-2.*f);
  float a=rnd(i), b=rnd(i+vec2(1,0)), c=rnd(i+vec2(0,1)), d=rnd(i+1.);
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
}
float fbm(vec2 p) {
  float t=.0, a=1.; mat2 m=mat2(1.,-.5,.2,1.2);
  for (int i=0; i<5; i++) {
    t+=a*noise(p);
    p*=2.*m;
    a*=.5;
  }
  return t;
}
float clouds(vec2 p) {
  float d=1., t=.0;
  for (float i=.0; i<3.; i++) {
    float a=d*fbm(i*10.+p.x*.2+.2*(1.+i)*p.y+d+i*i+p);
    t=mix(t,d,a);
    d=a;
    p*=2./(i+1.);
  }
  return t;
}
void main(void) {
  vec2 uv=(FC-.5*R)/MN,st=uv*vec2(2,1);
  vec3 col=vec3(0);
  float bg=clouds(vec2(st.x+T*.5,-st.y));
  uv*=1.-.3*(sin(T*.2)*.5+.5);
  for (float i=1.; i<12.; i++) {
    uv+=.1*cos(i*vec2(.1+.01*i, .8)+i*i+T*.5+.1*uv.x);
    vec2 p=uv;
    float d=length(p);
    col+=.00125/d*(cos(sin(i)*vec3(1,2,3))+1.);
    float b=noise(i+p+bg*1.731);
    col+=.002*b/length(max(p,vec2(b*p.x*.02,p.y)));
    col=mix(col,vec3(bg*.25,bg*.137,bg*.05),d);
  }
  O=vec4(col,1);
}`;

  class WebGLRenderer {
    constructor(canvas, scale) {
      this.canvas = canvas;
      this.scale = scale;
      this.gl = canvas.getContext('webgl2');
      if (!this.gl) return;
      this.gl.viewport(0, 0, canvas.width * scale, canvas.height * scale);
      this.shaderSource = defaultShaderSource;
      this.mouseMove = [0, 0];
      this.mouseCoords = [0, 0];
      this.pointerCoords = [0, 0];
      this.nbrOfPointers = 0;
      this.program = null;
      this.vs = null;
      this.fs = null;
      this.buffer = null;
      this.vertexSrc = `#version 300 es\nprecision highp float;\nin vec4 position;\nvoid main(){gl_Position=position;}`;
      this.vertices = [-1, 1, -1, -1, 1, 1, 1, -1];
    }

    compile(shader, source) {
      this.gl.shaderSource(shader, source);
      this.gl.compileShader(shader);
      if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
        console.error('Shader error:', this.gl.getShaderInfoLog(shader));
      }
    }

    setup() {
      this.vs = this.gl.createShader(this.gl.VERTEX_SHADER);
      this.fs = this.gl.createShader(this.gl.FRAGMENT_SHADER);
      this.compile(this.vs, this.vertexSrc);
      this.compile(this.fs, this.shaderSource);
      this.program = this.gl.createProgram();
      this.gl.attachShader(this.program, this.vs);
      this.gl.attachShader(this.program, this.fs);
      this.gl.linkProgram(this.program);
      if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
        console.error(this.gl.getProgramInfoLog(this.program));
      }
    }

    init() {
      this.buffer = this.gl.createBuffer();
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(this.vertices), this.gl.STATIC_DRAW);
      const program = this.program;
      const position = this.gl.getAttribLocation(program, 'position');
      this.gl.enableVertexAttribArray(position);
      this.gl.vertexAttribPointer(position, 2, this.gl.FLOAT, false, 0, 0);
      this.uniforms = {
        resolution: this.gl.getUniformLocation(program, 'resolution'),
        time: this.gl.getUniformLocation(program, 'time'),
        move: this.gl.getUniformLocation(program, 'move'),
        touch: this.gl.getUniformLocation(program, 'touch'),
        pointerCount: this.gl.getUniformLocation(program, 'pointerCount'),
        pointers: this.gl.getUniformLocation(program, 'pointers')
      };
    }

    updateMouse(coords) { this.mouseCoords = coords; }
    updatePointerCount(n) { this.nbrOfPointers = n; }
    updatePointerCoords(coords) { this.pointerCoords = coords; }
    updateMove(deltas) { this.mouseMove = deltas; }

    updateScale(scale) {
      this.scale = scale;
      this.gl.viewport(0, 0, this.canvas.width * scale, this.canvas.height * scale);
    }

    render(now) {
      if (!this.program || this.gl.getProgramParameter(this.program, this.gl.DELETE_STATUS)) return;
      const gl = this.gl;
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(this.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.uniform2f(this.uniforms.resolution, this.canvas.width, this.canvas.height);
      gl.uniform1f(this.uniforms.time, now * 1e-3);
      gl.uniform2f(this.uniforms.move, this.mouseMove[0], this.mouseMove[1]);
      gl.uniform2f(this.uniforms.touch, this.mouseCoords[0], this.mouseCoords[1]);
      gl.uniform1i(this.uniforms.pointerCount, this.nbrOfPointers);
      gl.uniform2fv(this.uniforms.pointers, this.pointerCoords);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }

  class PointerHandler {
    constructor(element, scale) {
      this.scale = scale;
      this.pointers = new Map();
      this.lastCoords = [0, 0];
      this.moves = [0, 0];

      const map = (el, s, x, y) => {
        const rect = el.getBoundingClientRect();
        const scaleX = el.width / rect.width;
        const scaleY = el.height / rect.height;
        const localX = (x - rect.left) * scaleX;
        const localY = (y - rect.top) * scaleY;
        return [localX, el.height - localY];
      };

      element.addEventListener('pointerdown', (e) => {
        this.pointers.set(e.pointerId, map(element, this.scale, e.clientX, e.clientY));
      });

      element.addEventListener('pointerup', (e) => {
        if (this.pointers.size === 1) this.lastCoords = this.first;
        this.pointers.delete(e.pointerId);
      });

      element.addEventListener('pointerleave', (e) => {
        if (this.pointers.size === 1) this.lastCoords = this.first;
        this.pointers.delete(e.pointerId);
      });

      element.addEventListener('pointermove', (e) => {
        this.lastCoords = [e.clientX, e.clientY];
        this.pointers.set(e.pointerId, map(element, this.scale, e.clientX, e.clientY));
        this.moves = [this.moves[0] + e.movementX, this.moves[1] + e.movementY];
      });
    }

    get count() { return this.pointers.size; }
    get move() { return this.moves; }
    get coords() {
      return this.pointers.size > 0 ? Array.from(this.pointers.values()).flat() : [0, 0];
    }
    get first() {
      return this.pointers.values().next().value || this.lastCoords;
    }
  }

  function initShaderBackground() {
    const canvas = document.getElementById('shaderBackground');
    if (!canvas || !canvas.getContext('webgl2')) return;

    const dpr = Math.max(1, 0.5 * (window.devicePixelRatio || 1));
    let renderer = null;
    let pointers = null;
    let animId = null;

    function resize() {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      if (renderer) renderer.updateScale(dpr);
    }

    function loop(now) {
      if (renderer && pointers) {
        renderer.updateMouse(pointers.first);
        renderer.updatePointerCount(pointers.count);
        renderer.updatePointerCoords(pointers.coords);
        renderer.updateMove(pointers.moves);
        renderer.render(now);
      }
      animId = requestAnimationFrame(loop);
    }

    renderer = new WebGLRenderer(canvas, dpr);
    if (!renderer.gl) return;
    renderer.setup();
    renderer.init();
    pointers = new PointerHandler(canvas, dpr);
    resize();
    loop(0);
    window.addEventListener('resize', resize);

    return function dispose() {
      window.removeEventListener('resize', resize);
      if (animId) cancelAnimationFrame(animId);
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initShaderBackground);
  } else {
    initShaderBackground();
  }
})();
