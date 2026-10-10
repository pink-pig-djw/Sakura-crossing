import * as THREE from 'three';

// Steadier sun shadows. three.js r186's PCF filter rotates its five taps per screen pixel
// with interleaved gradient noise, which is meant to be smoothed over frames by TAA; we have
// no TAA, so every sub-pixel move of the camera or of the sun re-rolls the noise and shadow
// edges sparkle. Here the taps sit on a fixed 3x3 grid instead (each a hardware 2x2 compare,
// so a smooth 4x4-texel footprint that slides with the shadow rather than shimmering).
// The PCF path also adds the depth bias with the same sign whatever the depth convention;
// with the reversed depth buffer that pushes surfaces away from the light (self-shadow
// stripes), so the sign follows the convention as the VSM path already does.

const NOISY = /float phi = interleavedGradientNoise\( gl_FragCoord\.xy \) \* PI2;\s*shadow = \(\s*texture\( shadowMap, vec3\( shadowCoord\.xy \+ vogelDiskSample\( 0, 5, phi \) \* radius, shadowCoord\.z \) \) \+[\s\S]*?\) \* 0\.2;/;

const GRID = `vec2 d = vec2( radius * 0.75 );
				shadow = 0.0;
				for ( int y = -1; y <= 1; y ++ ) {
					for ( int x = -1; x <= 1; x ++ ) {
						shadow += texture( shadowMap, vec3( shadowCoord.xy + vec2( float( x ), float( y ) ) * d, shadowCoord.z ) );
					}
				}
				shadow *= ( 1.0 / 9.0 );`;

const BIAS = /(float getShadow\( sampler2DShadow shadowMap[^{]*\{\s*float shadow = 1\.0;\s*shadowCoord\.xyz \/= shadowCoord\.w;\s*)shadowCoord\.z \+= shadowBias;/;

export function steadyShadows() {
  let src = THREE.ShaderChunk.shadowmap_pars_fragment;
  const ok = NOISY.test(src) && BIAS.test(src);
  if (!ok) {
    console.warn('steadyShadows: shadow chunk changed, leaving it as is');
    return false;
  }
  src = src.replace(NOISY, GRID);
  src = src.replace(BIAS, `$1#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif`);
  THREE.ShaderChunk.shadowmap_pars_fragment = src;
  return true;
}
