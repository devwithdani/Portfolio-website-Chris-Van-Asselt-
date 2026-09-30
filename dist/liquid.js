/* ==========================================================================
   Liquid: a small WebGL fluid simulation used as a living mask.
   The canvas paints the page background everywhere except where "ink" flows,
   so whatever sits underneath (the facility video) glimmers through the
   swirls the pointer and a slow rain of drops leave behind.
   ========================================================================== */

window.createLiquid = (() => {
  'use strict';

  const SHADERS = {
    vert: `
      precision highp float;
      attribute vec2 aPosition;
      varying vec2 vUv, vL, vR, vT, vB;
      uniform vec2 u_texel;
      void main () {
        vUv = aPosition * .5 + .5;
        vL = vUv - vec2(u_texel.x, 0.);
        vR = vUv + vec2(u_texel.x, 0.);
        vT = vUv + vec2(0., u_texel.y);
        vB = vUv - vec2(0., u_texel.y);
        gl_Position = vec4(aPosition, 0., 1.);
      }`,
    advection: `
      precision highp float;
      precision highp sampler2D;
      varying vec2 vUv;
      uniform sampler2D u_velocity, u_source;
      uniform vec2 u_texel, u_source_texel;
      uniform float u_dt, u_dissipation;
      vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
        vec2 st = uv / tsize - .5;
        vec2 iuv = floor(st);
        vec2 fuv = fract(st);
        vec4 a = texture2D(sam, (iuv + vec2(.5, .5)) * tsize);
        vec4 b = texture2D(sam, (iuv + vec2(1.5, .5)) * tsize);
        vec4 c = texture2D(sam, (iuv + vec2(.5, 1.5)) * tsize);
        vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);
        return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
      }
      void main () {
        vec2 coord = vUv - u_dt * bilerp(u_velocity, vUv, u_texel).xy * u_texel;
        gl_FragColor = u_dissipation * bilerp(u_source, coord, u_source_texel);
        gl_FragColor.a = 1.;
      }`,
    divergence: `
      precision highp float;
      precision highp sampler2D;
      varying vec2 vUv, vL, vR, vT, vB;
      uniform sampler2D u_velocity;
      void main () {
        float L = texture2D(u_velocity, vL).x;
        float R = texture2D(u_velocity, vR).x;
        float T = texture2D(u_velocity, vT).y;
        float B = texture2D(u_velocity, vB).y;
        gl_FragColor = vec4(.5 * (R - L + T - B), 0., 0., 1.);
      }`,
    pressure: `
      precision highp float;
      precision highp sampler2D;
      varying vec2 vUv, vL, vR, vT, vB;
      uniform sampler2D u_pressure, u_divergence;
      void main () {
        float L = texture2D(u_pressure, vL).x;
        float R = texture2D(u_pressure, vR).x;
        float T = texture2D(u_pressure, vT).x;
        float B = texture2D(u_pressure, vB).x;
        float div = texture2D(u_divergence, vUv).x;
        gl_FragColor = vec4((L + R + B + T - div) * .25, 0., 0., 1.);
      }`,
    gradient: `
      precision highp float;
      precision highp sampler2D;
      varying vec2 vUv, vL, vR, vT, vB;
      uniform sampler2D u_pressure, u_velocity;
      void main () {
        float L = texture2D(u_pressure, vL).x;
        float R = texture2D(u_pressure, vR).x;
        float T = texture2D(u_pressure, vT).x;
        float B = texture2D(u_pressure, vB).x;
        vec2 velocity = texture2D(u_velocity, vUv).xy - vec2(R - L, T - B);
        gl_FragColor = vec4(velocity, 0., 1.);
      }`,
    splat: `
      precision highp float;
      precision highp sampler2D;
      varying vec2 vUv;
      uniform sampler2D u_source;
      uniform float u_ratio, u_size;
      uniform vec3 u_value;
      uniform vec2 u_point;
      void main () {
        vec2 p = vUv - u_point;
        p.x *= u_ratio;
        vec3 splat = pow(2., -dot(p, p) / u_size) * u_value;
        gl_FragColor = vec4(texture2D(u_source, vUv).xyz + splat, 1.);
      }`,
    // Background colour everywhere, turning transparent where ink has pooled.
    display: `
      precision highp float;
      precision highp sampler2D;
      varying vec2 vUv;
      uniform sampler2D u_dye;
      uniform vec3 u_bg;
      void main () {
        vec3 C = texture2D(u_dye, vUv).rgb;
        float a = clamp(pow(dot(C, vec3(.333)), .4), 0., 1.);
        gl_FragColor = vec4(max(u_bg - C, 0.), 1. - a);
      }`,
  };

  // A drop lands as a core plus eight arms that burst outwards.
  const DROP = { size: [3, 8], force: [110, 240], arms: 8, reach: 0.9, gap: [1400, 3000] };
  // While the pointer rests, an unseen current keeps drifting through the page.
  const WANDER = { idleAfter: 1500, every: 2, size: 0.9, speed: 2.6 };
  const SIM_RESOLUTION = 128;
  const DYE_RESOLUTION = 512;
  const PRESSURE_ITERATIONS = 8;
  const DENSITY_DISSIPATION = 0.967;
  const VELOCITY_DISSIPATION = 0.9;
  const CANVAS_SCALE = 0.75;

  const hexToRgb = hex => {
    let h = hex.trim().replace('#', '');
    if (h.length === 3) h = [...h].map(c => c + c).join('');
    const n = parseInt(h, 16);
    return { r: (n >> 16 & 255) / 255, g: (n >> 8 & 255) / 255, b: (n & 255) / 255 };
  };

  return function createLiquid(canvas, { bg, ink }) {
    const gl = canvas.getContext('webgl', { alpha: true, depth: false, stencil: false, antialias: false, premultipliedAlpha: true });
    if (!gl) return null;
    const floatExt = gl.getExtension('OES_texture_float');
    const halfExt = floatExt ? null : gl.getExtension('OES_texture_half_float');
    if (!floatExt && !halfExt) return null;
    const texType = floatExt ? gl.FLOAT : halfExt.HALF_FLOAT_OES;

    const bgColor = hexToRgb(bg);
    const inkColor = hexToRgb(ink);
    let width = 1;
    let height = 1;
    let splatRadius = 1.6 / innerHeight;

    /* -- GL plumbing ------------------------------------------------------ */

    function compile(source, type) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    }

    const vertex = compile(SHADERS.vert, gl.VERTEX_SHADER);
    function program(name) {
      const p = gl.createProgram();
      gl.attachShader(p, vertex);
      gl.attachShader(p, compile(SHADERS[name], gl.FRAGMENT_SHADER));
      gl.bindAttribLocation(p, 0, 'aPosition');
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const uniforms = {};
      for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) {
        const { name: uniform } = gl.getActiveUniform(p, i);
        uniforms[uniform] = gl.getUniformLocation(p, uniform);
      }
      return { use: () => { gl.useProgram(p); return uniforms; } };
    }

    let programs;
    try {
      programs = Object.fromEntries(['advection', 'divergence', 'pressure', 'gradient', 'splat', 'display'].map(n => [n, program(n)]));
    } catch (error) {
      console.warn('Liquid background disabled:', error.message);
      return null;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    function blit(target) {
      if (target) {
        gl.viewport(0, 0, target.width, target.height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      } else {
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }

    function target(w, h, format = gl.RGBA) {
      gl.activeTexture(gl.TEXTURE0);
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, format, w, h, 0, format, texType, null);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      gl.viewport(0, 0, w, h);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return {
        fbo, width: w, height: h,
        complete: gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE,
        attach(unit) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texture); return unit; },
        dispose() { gl.deleteTexture(texture); gl.deleteFramebuffer(fbo); },
      };
    }

    function doubleTarget(w, h, format) {
      let read = target(w, h, format);
      let write = target(w, h, format);
      return {
        width: w, height: h, texel: [1 / w, 1 / h],
        complete: read.complete && write.complete,
        read: () => read, write: () => write,
        swap() { [read, write] = [write, read]; },
        dispose() { read.dispose(); write.dispose(); },
      };
    }

    // Resolution along the short side; the long side follows the canvas aspect.
    function gridSize(resolution) {
      const aspect = Math.max(gl.drawingBufferWidth, gl.drawingBufferHeight) / Math.min(gl.drawingBufferWidth, gl.drawingBufferHeight);
      const short = Math.round(resolution);
      const long = Math.round(resolution * aspect);
      return gl.drawingBufferWidth > gl.drawingBufferHeight ? [long, short] : [short, long];
    }

    let dye, velocity, divergence, pressure;
    function allocate() {
      [dye, velocity, divergence, pressure].forEach(t => t?.dispose());
      dye = doubleTarget(...gridSize(DYE_RESOLUTION));
      velocity = doubleTarget(...gridSize(SIM_RESOLUTION));
      divergence = target(...gridSize(SIM_RESOLUTION));
      pressure = doubleTarget(...gridSize(SIM_RESOLUTION));
      return dye.complete && velocity.complete && divergence.complete && pressure.complete;
    }

    function resize() {
      width = Math.max(1, canvas.clientWidth);
      height = Math.max(1, canvas.clientHeight);
      canvas.width = Math.max(1, Math.round(width * CANVAS_SCALE));
      canvas.height = Math.max(1, Math.round(height * CANVAS_SCALE));
      splatRadius = 1.6 / innerHeight;
      return allocate();
    }

    if (!resize()) {
      console.warn('Liquid background disabled: float render targets unsupported');
      return null;
    }

    /* -- Simulation ------------------------------------------------------- */

    function splat(x, y, dx, dy, size) {
      const u = programs.splat.use();
      gl.uniform1i(u.u_source, velocity.read().attach(0));
      gl.uniform1f(u.u_ratio, width / height);
      gl.uniform2f(u.u_point, x / width, 1 - y / height);
      gl.uniform3f(u.u_value, dx, -dy, 1);
      gl.uniform1f(u.u_size, size);
      blit(velocity.write());
      velocity.swap();

      gl.uniform1i(u.u_source, dye.read().attach(0));
      gl.uniform3f(u.u_value, Math.max(1 - inkColor.r, 0.02), Math.max(1 - inkColor.g, 0.02), Math.max(1 - inkColor.b, 0.02));
      blit(dye.write());
      dye.swap();
    }

    const pending = [];
    function drop(x, y) {
      const size = splatRadius * gsap.utils.random(...DROP.size);
      const reach = Math.sqrt(size) * height * DROP.reach;
      const force = gsap.utils.random(...DROP.force);
      const start = Math.random() * Math.PI * 2;
      pending.push({ x, y, dx: 0, dy: 0, size });
      for (let i = 0; i < DROP.arms; i++) {
        const angle = start + (i / DROP.arms) * Math.PI * 2;
        const cx = Math.cos(angle);
        const cy = Math.sin(angle);
        pending.push({ x: x + cx * reach, y: y + cy * reach, dx: cx * force, dy: cy * force, size: size * 0.45 });
      }
    }

    function step(dt) {
      const frames = dt / 0.016;
      while (pending.length) {
        const s = pending.shift();
        splat(s.x, s.y, s.dx, s.dy, s.size);
      }

      let u = programs.divergence.use();
      gl.uniform2f(u.u_texel, ...velocity.texel);
      gl.uniform1i(u.u_velocity, velocity.read().attach(0));
      blit(divergence);

      u = programs.pressure.use();
      gl.uniform2f(u.u_texel, ...velocity.texel);
      gl.uniform1i(u.u_divergence, divergence.attach(0));
      for (let i = 0; i < PRESSURE_ITERATIONS; i++) {
        gl.uniform1i(u.u_pressure, pressure.read().attach(1));
        blit(pressure.write());
        pressure.swap();
      }

      u = programs.gradient.use();
      gl.uniform2f(u.u_texel, ...velocity.texel);
      gl.uniform1i(u.u_pressure, pressure.read().attach(0));
      gl.uniform1i(u.u_velocity, velocity.read().attach(1));
      blit(velocity.write());
      velocity.swap();

      u = programs.advection.use();
      gl.uniform2f(u.u_texel, ...velocity.texel);
      gl.uniform2f(u.u_source_texel, ...velocity.texel);
      gl.uniform1i(u.u_velocity, velocity.read().attach(0));
      gl.uniform1i(u.u_source, velocity.read().attach(0));
      gl.uniform1f(u.u_dt, dt);
      gl.uniform1f(u.u_dissipation, VELOCITY_DISSIPATION ** frames);
      blit(velocity.write());
      velocity.swap();

      gl.uniform2f(u.u_source_texel, ...dye.texel);
      gl.uniform1i(u.u_velocity, velocity.read().attach(0));
      gl.uniform1i(u.u_source, dye.read().attach(1));
      gl.uniform1f(u.u_dissipation, DENSITY_DISSIPATION ** frames);
      blit(dye.write());
      dye.swap();

      u = programs.display.use();
      gl.uniform3f(u.u_bg, bgColor.r, bgColor.g, bgColor.b);
      gl.uniform1i(u.u_dye, dye.read().attach(0));
      blit(null);
    }

    /* -- Input, drops and the frame loop ---------------------------------- */

    const pointer = { x: 0, y: 0, dx: 0, dy: 0, moved: false, seen: false };
    const onMove = e => {
      if (e.pointerType === 'touch') return;
      // The first event only anchors the pointer, so it doesn't fling ink from the corner.
      if (!pointer.seen) { pointer.seen = true; pointer.x = e.clientX; pointer.y = e.clientY; return; }
      pointer.dx = 5 * (e.clientX - pointer.x);
      pointer.dy = 5 * (e.clientY - pointer.y);
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.moved = true;
      pointer.lastMove = performance.now();
    };
    const onDown = e => {
      if (e.pointerType === 'touch') return;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.dx = pointer.dy = 10;
      pointer.moved = true;
    };
    const onResize = () => resize();
    addEventListener('pointermove', onMove, { passive: true });
    addEventListener('pointerdown', onDown, { passive: true });
    addEventListener('resize', onResize);

    let paused = true;
    let frame = 0;
    let dropTimer = 0;
    let last = 0;

    function scheduleDrop() {
      clearTimeout(dropTimer);
      if (paused) return;
      dropTimer = setTimeout(() => {
        if (!document.hidden) drop(gsap.utils.random(0.1, 0.9) * width, gsap.utils.random(0.1, 0.9) * height);
        scheduleDrop();
      }, gsap.utils.random(...DROP.gap));
    }

    // A slow Lissajous path, so the drift never repeats in an obvious loop.
    const wanderAt = time => {
      const t = time * WANDER.speed;
      return [
        width * (0.5 + 0.34 * Math.sin(t * 0.13) + 0.1 * Math.sin(t * 0.41)),
        height * (0.5 + 0.28 * Math.sin(t * 0.17 + 1) + 0.12 * Math.cos(t * 0.31)),
      ];
    };
    let wanderTick = 0;

    function loop(now) {
      frame = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (pointer.moved) {
        pointer.moved = false;
        pending.push({ x: pointer.x, y: pointer.y, dx: pointer.dx, dy: pointer.dy, size: splatRadius });
      } else if (now - (pointer.lastMove || 0) > WANDER.idleAfter && ++wanderTick % WANDER.every === 0) {
        const t = now / 1000;
        const [x, y] = wanderAt(t);
        const [px, py] = wanderAt(t - 0.05);
        pending.push({ x, y, dx: (x - px) * 6, dy: (y - py) * 6, size: splatRadius * WANDER.size });
      }
      step(dt);
    }

    return {
      setPaused(value) {
        if (value === paused) return;
        paused = value;
        if (paused) {
          cancelAnimationFrame(frame);
          clearTimeout(dropTimer);
        } else {
          last = performance.now();
          frame = requestAnimationFrame(loop);
          scheduleDrop();
        }
      },
      destroy() {
        this.setPaused(true);
        removeEventListener('pointermove', onMove);
        removeEventListener('pointerdown', onDown);
        removeEventListener('resize', onResize);
        [dye, velocity, divergence, pressure].forEach(t => t.dispose());
      },
    };
  };
})();
