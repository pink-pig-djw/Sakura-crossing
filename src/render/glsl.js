// Shared GLSL snippets: hashing/noise, procedural surface patterns and the
// anime-style lighting model used by every lit material in the town.

export const NOISE = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm3(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, -9.7);
    a *= 0.5;
  }
  return s / 0.875;
}
float fbm5(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, -9.7);
    a *= 0.5;
  }
  return s / 0.96875;
}
// distance to nearest feature point (cellular), returns (F1, cell id hash)
vec2 voronoi(vec2 p) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float md = 8.0;
  float id = 0.0;
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash22(n + g);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < md) {
        md = d;
        id = hash12(n + g);
      }
    }
  return vec2(sqrt(md), id);
}
// voronoi edge distance (F2 - F1 style border)
float voronoiEdge(vec2 p) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  vec2 mg, mr;
  float md = 8.0;
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash22(n + g);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < md) { md = d; mr = r; mg = g; }
    }
  md = 8.0;
  for (int j = -2; j <= 2; j++)
    for (int i = -2; i <= 2; i++) {
      vec2 g = mg + vec2(float(i), float(j));
      vec2 o = hash22(n + g);
      vec2 r = g + o - f;
      if (dot(mr - r, mr - r) > 0.00001) md = min(md, dot(0.5 * (mr + r), normalize(r - mr)));
    }
  return md;
}
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

// Anti-aliased repeating line helpers. `x` is a coordinate in meters.
export const LINES = /* glsl */ `
// 1.0 on thin lines of width w repeating each 'period'; fades when too dense for the pixel grid.
float aaLines(float x, float period, float w) {
  float fw = max(fwidth(x), 1e-5);
  float d = abs(fract(x / period + 0.5) - 0.5) * period;
  float l = 1.0 - smoothstep(w * 0.5 - fw * 0.75, w * 0.5 + fw * 0.75, d);
  float dens = clamp(period / (fw * 5.0) - 0.4, 0.0, 1.0);
  return l * dens;
}
// sawtooth shading for overlapping boards: 0 at the board's lower edge -> 1 above
float aaSaw(float x, float period, float soft) {
  float fw = max(fwidth(x), 1e-5);
  float f = fract(x / period) * period;
  float s = smoothstep(0.0, soft + fw, f);
  float dens = clamp(period / (fw * 5.0) - 0.4, 0.0, 1.0);
  return mix(0.65, s, dens);
}
float aaStep(float edge, float x) {
  float fw = max(fwidth(x), 1e-5);
  return smoothstep(edge - fw * 0.7, edge + fw * 0.7, x);
}
`;

// Procedural surface detail. `albedo` is modified in place.
export const PATTERNS = /* glsl */ `
vec3 applyPattern(vec3 albedo, float patF, vec2 uv, vec3 wp, vec3 N) {
  int pat = int(patF + 0.5);
  // painterly large-scale value/hue drift so flat walls don't look CG-flat
  float drift = vnoise(wp.xz * 0.11 + wp.y * 0.05);
  albedo *= 0.94 + 0.12 * drift;
  if (pat == 0) return albedo;

  if (pat == 1) { // horizontal lap siding
    float s = aaSaw(uv.y, 0.205, 0.035);
    albedo *= 0.88 + 0.12 * s;
    float j = aaLines(uv.x + floor(uv.y / 0.205) * 1.37, 3.03, 0.012);
    albedo *= 1.0 - 0.10 * j;
  } else if (pat == 2) { // vertical wooden boards
    float bi = floor(uv.x / 0.165);
    albedo *= 0.88 + 0.16 * hash12(vec2(bi, 3.1));
    albedo *= 1.0 - 0.28 * aaLines(uv.x, 0.165, 0.014);
    albedo *= 0.94 + 0.08 * vnoise(vec2(uv.x * 9.0, uv.y * 0.7));
  } else if (pat == 3) { // kawara roof tiles (u along eave, v up the slope)
    float row = floor(uv.y / 0.27);
    float s = aaSaw(uv.y, 0.27, 0.06);
    float wave = 0.5 + 0.5 * sin((uv.x + row * 0.15) / 0.29 * 6.2832);
    float fw = fwidth(uv.x) * 18.0;
    wave = mix(wave, 0.5, clamp(fw, 0.0, 1.0));
    albedo *= (0.80 + 0.2 * s) * (0.86 + 0.18 * wave);
    albedo *= 0.94 + 0.1 * hash12(vec2(floor(uv.x / 0.29), row));
  } else if (pat == 4) { // concrete block wall
    float row = floor(uv.y / 0.2);
    float ux = uv.x + mod(row, 2.0) * 0.2;
    float m = max(aaLines(uv.y, 0.2, 0.012), aaLines(ux, 0.4, 0.012));
    albedo *= 0.93 + 0.1 * hash12(vec2(floor(ux / 0.4), row));
    albedo *= 1.0 - 0.18 * m;
    albedo *= 0.95 + 0.08 * vnoise(uv * 6.0);
  } else if (pat == 5) { // brick
    float row = floor(uv.y / 0.075);
    float ux = uv.x + mod(row, 2.0) * 0.11;
    float m = max(aaLines(uv.y, 0.075, 0.01), aaLines(ux, 0.22, 0.01));
    float h = hash12(vec2(floor(ux / 0.22), row));
    albedo *= 0.84 + 0.24 * h;
    albedo = mix(albedo, vec3(0.62, 0.6, 0.56), m * 0.7);
  } else if (pat == 6) { // asphalt
    float g = vnoise(wp.xz * 7.0) * 0.6 + vnoise(wp.xz * 23.0) * 0.4;
    albedo *= 0.9 + 0.18 * g;
    float rep = smoothstep(0.62, 0.66, fbm3(wp.xz * 0.06 + 3.0));
    albedo *= 1.0 - 0.10 * rep;
    float sp = step(0.985, hash12(floor(wp.xz * 30.0)));
    albedo *= 1.0 + 0.35 * sp * clamp(1.0 - fwidth(wp.x) * 30.0, 0.0, 1.0);
  } else if (pat == 7) { // concrete
    float b = fbm3(wp.xz * 0.7 + wp.y * 0.7);
    albedo *= 0.9 + 0.16 * b;
    float jt = max(aaLines(uv.x, 2.0, 0.012), aaLines(uv.y, 2.0, 0.012));
    albedo *= 1.0 - 0.10 * jt;
  } else if (pat == 8) { // sand
    float g = vnoise(wp.xz * 9.0);
    float rip = sin(wp.x * 2.3 + wp.z * 0.6 + vnoise(wp.xz * 0.5) * 6.0);
    float fw = clamp(fwidth(wp.x) * 3.0, 0.0, 1.0);
    albedo *= 0.94 + 0.1 * g;
    albedo *= 1.0 + 0.045 * rip * (1.0 - fw);
    albedo *= 0.95 + 0.1 * fbm3(wp.xz * 0.08);
  } else if (pat == 9) { // grass
    float n1 = fbm3(wp.xz * 0.35);
    float n2 = vnoise(wp.xz * 5.0);
    albedo *= 0.82 + 0.3 * n1;
    albedo *= 0.92 + 0.14 * n2;
    albedo = mix(albedo, albedo * vec3(1.05, 1.08, 0.82), smoothstep(0.55, 0.75, n1));
    // tiny spring flowers
    vec2 cell = floor(wp.xz * 3.0);
    vec2 fr = fract(wp.xz * 3.0) - 0.5 - (hash22(cell) - 0.5) * 0.6;
    float h = hash12(cell + 7.7);
    float flower = step(0.93, h) * (1.0 - smoothstep(0.06, 0.1, length(fr)));
    float fade = clamp(1.0 - fwidth(wp.x) * 9.0, 0.0, 1.0);
    vec3 fc = h > 0.97 ? vec3(1.0, 0.85, 0.2) : vec3(1.0, 0.97, 0.95);
    albedo = mix(albedo, fc, flower * fade);
  } else if (pat == 10) { // corrugated metal
    float s = sin(uv.x / 0.076 * 6.2832);
    float fw = clamp(fwidth(uv.x) * 30.0, 0.0, 1.0);
    albedo *= 0.92 + 0.08 * s * (1.0 - fw);
    albedo *= 0.95 + 0.07 * vnoise(vec2(uv.x * 2.0, uv.y * 12.0));
  } else if (pat == 11) { // wooden lattice / koshi slats
    float l = aaLines(uv.x, 0.07, 0.022);
    albedo *= 1.0 - 0.45 * l;
  } else if (pat == 12) { // standing seam metal roof
    float l = aaLines(uv.x, 0.45, 0.025);
    albedo *= 0.96 + 0.06 * vnoise(vec2(uv.x * 3.0, uv.y * 0.5));
    albedo = mix(albedo, albedo * 1.25, l);
  } else if (pat == 13) { // stone paving / stone wall
    float e = voronoiEdge(uv * 2.6);
    vec2 v = voronoi(uv * 2.6);
    albedo *= 0.86 + 0.22 * v.y;
    float fw = fwidth(uv.x) * 2.6;
    albedo *= mix(0.62, 1.0, smoothstep(0.02, 0.05 + fw, e));
  } else if (pat == 14) { // gravel
    vec2 v = voronoi(wp.xz * 14.0);
    float fw = clamp(fwidth(wp.x) * 14.0, 0.0, 1.0);
    albedo *= mix(0.78 + 0.4 * v.y - 0.3 * smoothstep(0.35, 0.6, v.x), 1.0, fw);
    albedo *= 0.93 + 0.12 * vnoise(wp.xz * 0.9);
  } else if (pat == 15) { // wooden planks (deck / floor)
    float row = floor(uv.y / 0.14);
    float j = aaLines(uv.x + hash12(vec2(row, 1.0)) * 1.8, 1.8, 0.01);
    albedo *= 0.88 + 0.16 * hash12(vec2(row, 4.0));
    albedo *= 1.0 - 0.3 * max(aaLines(uv.y, 0.14, 0.01), j);
  } else if (pat == 16) { // small square tiles
    float l = max(aaLines(uv.x, 0.15, 0.008), aaLines(uv.y, 0.15, 0.008));
    albedo *= 0.96 + 0.06 * hash12(floor(uv / 0.15));
    albedo *= 1.0 - 0.14 * l;
  } else if (pat == 17) { // cherry bark: horizontal lenticels
    float row = floor(uv.y / 0.06);
    float h = hash12(vec2(row, 9.0));
    float dash = aaLines(uv.y, 0.06, 0.012) * step(0.45, vnoise(vec2(uv.x * 6.0 + h * 10.0, row)));
    albedo *= 0.85 + 0.2 * vnoise(vec2(uv.x * 3.0, uv.y * 1.5));
    albedo *= 1.0 - 0.35 * dash;
  } else if (pat == 18) { // slate / colorbest roof
    float row = floor(uv.y / 0.22);
    float s = aaSaw(uv.y, 0.22, 0.03);
    float j = aaLines(uv.x + row * 0.45, 0.91, 0.012);
    albedo *= (0.84 + 0.16 * s) * (1.0 - 0.15 * j);
    albedo *= 0.96 + 0.07 * hash12(vec2(floor((uv.x + row * 0.45) / 0.91), row));
  } else if (pat == 19) { // yellow/black safety stripes
    float s = aaStep(0.5, fract((uv.x + uv.y) / 0.36));
    albedo = mix(albedo, vec3(0.03, 0.03, 0.035), s);
  } else if (pat == 20) { // dirt
    albedo *= 0.85 + 0.25 * fbm3(wp.xz * 0.9);
    albedo *= 0.94 + 0.12 * vnoise(wp.xz * 12.0);
  } else if (pat == 21) { // painted metal (subtle streaks)
    albedo *= 0.95 + 0.06 * vnoise(vec2(uv.x * 8.0, uv.y * 0.6));
  } else if (pat == 22) { // interlocking pavers
    float row = floor(uv.y / 0.1);
    float ux = uv.x + mod(row, 2.0) * 0.1;
    float l = max(aaLines(uv.y, 0.1, 0.008), aaLines(ux, 0.2, 0.008));
    float h = hash12(vec2(floor(ux / 0.2), row));
    albedo *= h > 0.8 ? 0.86 : (0.97 + 0.05 * h);
    albedo *= 1.0 - 0.18 * l;
  } else if (pat == 23) { // tatami: rush woven across the mat (u runs along it), a soft sheen
    float w = aaLines(uv.x, 0.0125, 0.005);
    albedo *= 1.0 - 0.12 * w;
    albedo *= 0.96 + 0.07 * vnoise(vec2(uv.x * 0.8, uv.y * 3.0));
    albedo *= 0.97 + 0.05 * vnoise(vec2(uv.x * 30.0, uv.y * 1.5));
  } else if (pat == 24) { // rock
    float n = fbm5(vec2(wp.x + wp.z, wp.y) * 0.8);
    albedo *= 0.75 + 0.45 * n;
    albedo *= 1.0 - 0.3 * smoothstep(0.05, 0.0, abs(vnoise(wp.xz * 1.3 + wp.y) - 0.5));
  } else if (pat == 26) { // clipped leaves (hedge cores): tiny leaves over darker hollows
    vec2 q = abs(N.y) > 0.6 ? wp.xz : (abs(N.x) > abs(N.z) ? wp.zy : wp.xy);
    float hollow = smoothstep(0.35, 0.7, fbm3(q * 2.2));
    vec2 v = voronoi(vec2(q.x * 26.0, q.y * 18.0));
    float leaf = 1.0 - smoothstep(0.3, 0.75, v.x);
    float fade = clamp(1.0 - fwidth(q.x) * 30.0, 0.0, 1.0);
    albedo *= mix(0.9, mix(0.72, 0.86 + 0.3 * v.y, leaf), fade);
    albedo *= mix(1.06, 0.72, hollow);
  }
  return albedo;
}
`;

// Anime lighting: hard terminator, colored (lavender) shadows that keep the local colour
// rich, sunlit faces that stay warm, a warm band at the light/shadow edge, sky-tinted
// ambient and aerial perspective.
// the rain map (render/rainmap.js): the highest surface over (x, z), a roof, a canopy, a
// bridge, or the ground itself
export const RAINTOP = /* glsl */ `
uniform sampler2D uRainMap;
uniform vec4 uRainRect;
uniform vec2 uRainRange;
float rainTop(vec2 xz) {
  vec2 uv = (xz - uRainRect.xy) * uRainRect.zw;
  if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return -1e4;
  vec4 t = texture2D(uRainMap, uv);
  return uRainRange.x + (floor(t.r * 255.0 + 0.5) + t.g) / 255.0 * uRainRange.y;
}
`;

export const LIGHTING = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyAmb;
uniform vec3 uGroundAmb;
uniform vec3 uHazeColor;
uniform vec3 uSunGlow;
uniform float uHazeDensity;
uniform float uNight;
uniform float uTime;
uniform vec3 uShadowTint;
uniform float uShadowSat;
uniform float uAmbLit;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform float uRain;
uniform float uWet;
${RAINTOP}

// ---- rain (see systems/weather.js, render/rainmap.js) ----
// how wet a surface is: out in the rain (nothing over it), more so facing up
float wetness(vec3 wp, vec3 N) {
  if (uWet < 0.002) return 0.0;
  float open = smoothstep(-0.45, -0.12, wp.y - rainTop(wp.xz));
  return uWet * open * mix(0.4, 1.0, smoothstep(0.2, 0.85, N.y));
}
// puddles gather on the flat (where the ground dips), more the longer it rains
float puddle(vec3 wp, vec3 N, float w) {
  float flat_ = smoothstep(0.96, 0.995, N.y);
  if (flat_ <= 0.0 || w <= 0.0) return 0.0;
  float n = vnoise(wp.xz * 0.5) * 0.6 + vnoise(wp.xz * 1.6 + 7.3) * 0.4;
  return smoothstep(0.725, 0.75, n + 0.06 * w * w) * flat_ * smoothstep(0.35, 0.9, w);
}
// raindrops landing: rings spreading on the water (a slope in xz to tilt the normal by)
vec2 rainRings(vec2 p, float t) {
  vec2 acc = vec2(0.0);
  for (int k = 0; k < 2; k++) {
    vec2 q = p * (k == 0 ? 2.6 : 3.7) + float(k) * 17.3;
    vec2 cell = floor(q);
    vec2 f = fract(q) - 0.5;
    float h = hash12(cell + float(k) * 3.1);
    vec2 c = vec2(hash12(cell + 1.7), hash12(cell + 9.2)) - 0.5;
    float age = fract(t * (0.9 + 0.5 * h) + h);
    vec2 d = f - c * 0.5;
    float dl = length(d);
    float r = age * 0.45;
    float ring = sin((dl - r) * 46.0) * smoothstep(0.07, 0.0, abs(dl - r)) * (1.0 - age);
    acc += ring * d / max(dl, 1e-3) * step(h, 0.35 + 0.65 * uRain);
  }
  return acc;
}
// the wet look: darker, deeper colour, and the grey sky (or the lit street) in the sheen
vec3 wetAlbedo(vec3 albedo, float w, float pd) {
  vec3 a = mix(vec3(luma(albedo)), albedo, 1.0 + 0.25 * w);
  return max(a, 0.0) * (1.0 - 0.36 * w) * (1.0 - 0.35 * pd);
}
vec3 wetSheen(vec3 col, vec3 N, vec3 wp, float w, float pd) {
  if (w <= 0.0) return col;
  vec3 V = normalize(cameraPosition - wp);
  vec3 n = N;
  if (uRain > 0.01 && pd > 0.01) {
    vec2 s = rainRings(wp.xz, uTime) * 0.35 * pd;
    n = normalize(N + vec3(s.x, 0.0, s.y));
  }
  vec3 R = reflect(-V, n);
  float F = 0.04 + 0.96 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
  vec3 sky = mix(uHorizon, uZenith, pow(clamp(R.y, 0.0, 1.0), 0.6));
  float k = w * (0.3 + 0.7 * pd) * F * smoothstep(0.3, 0.9, N.y) * step(0.0, R.y);
  return mix(col, sky * 0.85 * (1.0 - 0.6 * uNight), clamp(k, 0.0, 0.7));
}

vec3 hazeColorFor(vec3 viewDir) {
  float s = max(dot(viewDir, uSunDir), 0.0);
  return uHazeColor + uSunGlow * (pow(s, 6.0) * 0.6);
}

vec3 applyHaze(vec3 col, vec3 wp) {
  vec3 v = wp - cameraPosition;
  float dist = length(v);
  float h = 1.0 - exp(-dist * uHazeDensity);
  // thinner haze for high geometry (hills stay readable)
  h *= 1.0 - 0.35 * clamp((wp.y - 20.0) / 120.0, 0.0, 1.0);
  return mix(col, hazeColorFor(v / max(dist, 1e-3)), h);
}

// the shaded side as a painter mixes it: the local colour a little richer rather than
// greyed, in the cool tint of the hour
vec3 shadeColor(vec3 albedo, vec3 amb) {
  return max(mix(vec3(luma(albedo)), albedo, uShadowSat), 0.0) * amb * uShadowTint;
}

vec3 toonShade(vec3 albedo, vec3 N, float shadow, float softness, float wrap) {
  float ndl = dot(N, uSunDir);
  float lam = smoothstep(-softness + wrap, softness + wrap, ndl);
  float L = lam * shadow;
  vec3 amb = mix(uGroundAmb, uSkyAmb, N.y * 0.5 + 0.5);
  // sunlit: the sun dominates the sky fill, so lit faces stay warm and clear
  vec3 lit = albedo * (amb * uAmbLit + uSunColor);
  // second (highlight) tone on faces turned to the sun
  lit += albedo * uSunColor * 0.10 * smoothstep(0.55, 0.65, ndl);
  vec3 col = mix(shadeColor(albedo, amb), lit, L);
  // saturated warm band where light meets shadow (painted look)
  float band = L * (1.0 - L) * 4.0;
  col += albedo * band * uSunColor * vec3(0.20, 0.08, 0.02);
  return col;
}

// ---- the town's lamps at night (render/lamps.js) ----
// (a wet street shows a lamp this many times further off than its pool reaches: lamps.js too)
const float SHEEN_REACH = 2.2;
uniform sampler2D uLampData;  // a column a lamp: (light x, y, z, pool radius), (pool x, z, floor, height), (colour, open sky)
uniform sampler2D uLampCells; // per 8 m cell, two texels: up to eight lamps (index + 1; 0 none)
uniform vec4 uLampGrid;       // x0, z0, 1 / cell, cells across
uniform float uLampRows;
uniform float uLampCount;
// the lamps' light at P on a surface of colour albedo facing N: a soft pool under each and
// round it (falling to nothing at its edge), on whatever faces it; on a wet surface (w, pd:
// puddles) the lamp mirrored in it as well, a long way further off. A lamp out under the sky
// does not reach under a roof (a shop's floor behind its wall)
vec3 lampLight(vec3 albedo, vec3 P, vec3 N, float w, float pd) {
  float on = smoothstep(0.35, 0.9, uNight);
  if (on < 0.01 || uLampCount < 0.5) return vec3(0.0);
  vec2 c = floor((P.xz - uLampGrid.xy) * uLampGrid.z);
  if (c.x < 0.0 || c.y < 0.0 || c.x >= uLampGrid.w || c.y >= uLampRows) return vec3(0.0);
  vec3 V = normalize(cameraPosition - P);
  float roof = rainTop(P.xz) - P.y;
  vec3 dif = vec3(0.0), spec = vec3(0.0);
  for (int t = 0; t < 2; t++) {
    vec4 ids = texelFetch(uLampCells, ivec2(int(c.x) * 2 + t, int(c.y)), 0);
    for (int k = 0; k < 4; k++) {
      int i = int(ids[k] + 0.5) - 1;
      if (i < 0) break;
      vec4 L = texelFetch(uLampData, ivec2(i, 0), 0);
      vec4 Q = texelFetch(uLampData, ivec2(i, 1), 0);
      vec4 C = texelFetch(uLampData, ivec2(i, 2), 0);
      // over the lamp's head or well below its floor: none of its light
      float v = P.y - Q.z;
      float vf = smoothstep(-1.4, -0.5, v) * (1.0 - smoothstep(Q.w + 0.1, Q.w + 0.8, v));
      // under a roof, from a lamp out under the sky (but for its own head over its foot)
      if (C.a > 0.5 && roof > 0.4 && length(P.xz - L.xz) > 0.7) vf *= 0.1;
      if (vf <= 0.0) continue;
      vec3 d = L.xyz - P;
      vec3 l = d / max(length(d), 1e-3);
      float x = length(P.xz - Q.xy) / L.w;
      if (x < 1.0) {
        float u = 1.0 - x * x;
        float pool = u * u * (0.7 + 0.3 * u);
        dif += C.rgb * pool * vf * (0.12 + 0.88 * smoothstep(-0.1, 0.55, dot(N, l)));
      }
      float xs = x * (1.0 / SHEEN_REACH);
      if (w > 0.0 && xs < 1.0) {
        vec3 H = normalize(V + l);
        float s = pow(max(dot(N, H), 0.0), mix(60.0, 380.0, pd)) * mix(1.0, 2.4, pd);
        float us = 1.0 - xs * xs;
        spec += C.rgb * s * us * us * vf;
      }
    }
    if (int(ids.w + 0.5) == 0) break;
  }
  return (albedo * dif * 1.45 + spec * w * 1.3) * on;
}
`;
