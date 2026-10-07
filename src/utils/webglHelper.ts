/**
 * WebGL Helper and Shader Pipeline for Impasto Relief and Seamless Lighting Loop
 */

export interface ShaderUniforms {
  time: number;
  loopDuration: number;
  lightPos: [number, number, number];
  lightIntensity: number;
  beamRadius: number;
  impastoDepth: number;
  breezeStrength: number;
  ambientLevel: number;
  specularPower: number;
  specularStrength: number;
  resolution: [number, number];
}

const VERTEX_SHADER_SOURCE = `
attribute vec2 a_position;
varying vec2 v_uv;

void main() {
  v_uv = (a_position + 1.0) * 0.5;
  // Flip Y for texture coordinates
  v_uv.y = 1.0 - v_uv.y;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_SOURCE = `
precision highp float;

uniform sampler2D u_texture;
uniform float u_time;
uniform float u_loopDuration;
uniform vec3 u_lightPos; // x, y (0..1), z (elevation)
uniform float u_lightIntensity;
uniform float u_beamRadius;
uniform float u_impastoDepth;
uniform float u_breezeStrength;
uniform float u_ambientLevel;
uniform float u_specularPower;
uniform float u_specularStrength;
uniform vec2 u_resolution;

varying vec2 v_uv;

#define PI 3.14159265358979323846

// Calculate relative luminance of a color
float getLuminance(vec4 col) {
  return dot(col.rgb, vec3(0.299, 0.587, 0.114));
}

// Compute organic micro-breeze offset for blue florets and stems
vec2 calculateBreeze(vec2 uv, float phase) {
  // Distance from center of the main bloom
  vec2 center = vec2(0.5, 0.52);
  float distFromCenter = length(uv - center);

  // Sample original color at current UV to detect blue flower presence
  vec4 baseSample = texture2D(u_texture, uv);

  // Blue flower detection: higher blue channel compared to red and dark green
  float blueDominance = max(0.0, baseSample.b - max(baseSample.r, baseSample.g * 0.95));
  float isBlueFlower = smoothstep(0.04, 0.22, blueDominance);

  // The central large flower is within radius 0.28 - it must stay completely still
  float centerStillness = smoothstep(0.26, 0.44, distFromCenter);

  // Overall breeze mask: only the peripheral blue flowers and delicate hanging stems sway
  float breezeMask = isBlueFlower * centerStillness * u_breezeStrength;

  // Seamless harmonic oscillation (period = 1.0 in normalized loop phase)
  // Two harmonics with integer multiples of 2*PI guarantee exact seamless continuity
  float wave1 = sin(phase * 2.0 * PI + uv.y * 7.0);
  float wave2 = sin(phase * 4.0 * PI + uv.x * 6.0 + 1.5) * 0.35;
  float wave3 = cos(phase * 2.0 * PI + uv.y * 5.0 + 0.8) * 0.65;

  vec2 displacement = vec2(
    (wave1 + wave2) * 0.0018,
    wave3 * 0.0012
  );

  return uv + displacement * breezeMask;
}

// Sobel-like height & normal estimation for thick oil impasto brushstrokes
vec3 computeImpastoNormal(vec2 uv, vec2 texelSize) {
  // Sample 4 cardinal neighbors to compute surface gradient (impasto depth)
  float offset = 1.4;
  vec2 stepX = vec2(texelSize.x * offset, 0.0);
  vec2 stepY = vec2(0.0, texelSize.y * offset);

  float lumC = getLuminance(texture2D(u_texture, uv));
  float lumL = getLuminance(texture2D(u_texture, uv - stepX));
  float lumR = getLuminance(texture2D(u_texture, uv + stepX));
  float lumT = getLuminance(texture2D(u_texture, uv - stepY));
  float lumB = getLuminance(texture2D(u_texture, uv + stepY));

  // Compute gradients along X and Y
  float dX = (lumR - lumL) * u_impastoDepth * 14.0;
  float dY = (lumB - lumT) * u_impastoDepth * 14.0;

  // Surface normal vector pointing outwards from canvas (Z is normal to painting plane)
  vec3 normal = normalize(vec3(-dX, -dY, 1.0));
  return normal;
}

void main() {
  vec2 texelSize = 1.0 / u_resolution;

  // Normalized phase: exactly [0.0, 1.0] across the loop duration
  float phase = mod(u_time, u_loopDuration) / u_loopDuration;

  // Apply subtle micro-breeze displacement
  vec2 sampleUV = calculateBreeze(v_uv, phase);

  // Sample original painting color
  vec4 color = texture2D(u_texture, sampleUV);

  // Compute 3D surface normal of the thick oil impasto brushstrokes
  vec3 normal = computeImpastoNormal(sampleUV, texelSize);

  // 3D position on painting surface (UV mapped to [0, 1], Z is 0 at canvas plane)
  vec3 surfacePos = vec3(sampleUV.x, sampleUV.y, 0.0);

  // Light vector pointing from surface to light source
  vec3 lightVec = u_lightPos - surfacePos;
  // Aspect ratio correction for Euclidean distance
  float aspect = u_resolution.x / u_resolution.y;
  vec2 distXY = (u_lightPos.xy - surfacePos.xy) * vec2(1.0, 1.0 / aspect);
  float dist2D = length(distXY);

  // Soft diffused beam falloff (Gaussian-like smooth envelope)
  float beamFalloff = exp(-pow(dist2D / (u_beamRadius * 0.75), 2.2));

  // Distance attenuation
  float lightDist3D = length(lightVec);
  vec3 lightDir = normalize(lightVec);

  // Diffuse illumination term (Lambertian with wrap-around for soft oil sheen)
  float NdotL = dot(normal, lightDir);
  float diffuse = max(0.0, (NdotL + 0.25) / 1.25);

  // Specular reflection term (Blinn-Phong) for glossy oil paint and knife ridges
  vec3 viewDir = vec3(0.0, 0.0, 1.0); // Viewer perpendicular to painting
  vec3 halfVec = normalize(lightDir + viewDir);
  float NdotH = max(0.0, dot(normal, halfVec));
  float specular = pow(NdotH, u_specularPower) * u_specularStrength;

  // Shifting micro-shadows: when light is grazing, the ridges cast delicate penumbras
  float grazingShadow = smoothstep(0.0, 0.35, NdotL);

  // Combine lighting factors
  // Ambient chiaroscuro level keeps the dark gallery atmosphere
  float ambient = u_ambientLevel;

  // Traveling beam illumination
  float dynamicLight = (diffuse * grazingShadow + specular) * beamFalloff * u_lightIntensity;

  // Soft overall brightness factor
  float totalIllumination = ambient + dynamicLight;

  // Subtle warm-neutral tint for the passing gallery light
  vec3 lightTint = vec3(1.03, 1.01, 0.98);

  // Final color composition
  vec3 finalColor = color.rgb * (ambient + dynamicLight * lightTint);

  // Add sharp specular highlight directly on high ridges for tactile impasto glint
  vec3 glintColor = vec3(0.95, 0.97, 1.0) * specular * beamFalloff * u_lightIntensity * 0.45;
  finalColor += glintColor;

  gl_FragColor = vec4(finalColor, color.a);
}
`;

export class WebGLPaintingRenderer {
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private positionBuffer: WebGLBuffer | null = null;
  private imageElement: HTMLImageElement | null = null;
  private isLoaded = false;

  private uniformLocations: Record<string, WebGLUniformLocation | null> = {};

  constructor(private canvas: HTMLCanvasElement) {
    this.initGL();
  }

  private initGL() {
    const gl = this.canvas.getContext('webgl', {
      alpha: false,
      depth: false,
      antialias: true,
      preserveDrawingBuffer: true, // Necessary for canvas capture and frame export
    });

    if (!gl) {
      console.error('WebGL context could not be initialized.');
      return;
    }
    this.gl = gl;

    // Compile shaders
    const vertShader = this.compileShader(gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
    const fragShader = this.compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);

    if (!vertShader || !fragShader) return;

    const program = gl.createProgram();
    if (!program) return;

    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Unable to link shader program:', gl.getProgramInfoLog(program));
      return;
    }
    this.program = program;

    // Cache uniform locations
    const uniforms = [
      'u_texture',
      'u_time',
      'u_loopDuration',
      'u_lightPos',
      'u_lightIntensity',
      'u_beamRadius',
      'u_impastoDepth',
      'u_breezeStrength',
      'u_ambientLevel',
      'u_specularPower',
      'u_specularStrength',
      'u_resolution',
    ];
    for (const name of uniforms) {
      this.uniformLocations[name] = gl.getUniformLocation(program, name);
    }

    // Setup full-screen quad (2 triangles)
    const positions = new Float32Array([
      -1.0, -1.0,
       1.0, -1.0,
      -1.0,  1.0,
      -1.0,  1.0,
       1.0, -1.0,
       1.0,  1.0,
    ]);

    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
  }

  private compileShader(type: number, source: string): WebGLShader | null {
    const gl = this.gl;
    if (!gl) return null;

    const shader = gl.createShader(type);
    if (!shader) return null;

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('An error occurred compiling shader:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  public async loadTexture(imageUrl: string): Promise<boolean> {
    const gl = this.gl;
    if (!gl) return false;

    const tryLoadImage = (url: string, crossOrigin?: string | null): Promise<HTMLImageElement> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        if (crossOrigin) {
          img.crossOrigin = crossOrigin;
        }
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(e);
        img.src = url;
      });
    };

    let img: HTMLImageElement | HTMLCanvasElement | null = null;

    // Attempt 1: Load image directly without crossOrigin (same-origin / data URL)
    try {
      img = await tryLoadImage(imageUrl, null);
    } catch {
      // Attempt 2: Load with anonymous crossOrigin
      try {
        img = await tryLoadImage(imageUrl, 'anonymous');
      } catch {
        // Attempt 3: Fetch as blob to bypass iframe restrictions
        try {
          const resp = await fetch(imageUrl);
          if (resp.ok) {
            const blob = await resp.blob();
            const blobUrl = URL.createObjectURL(blob);
            img = await tryLoadImage(blobUrl, null);
          }
        } catch {
          // ignore
        }
      }
    }

    // Attempt 4: If still not loaded, generate beautiful procedural impasto oil canvas
    if (!img) {
      console.warn('Artwork image failed to load, generating procedural sculptural impasto canvas texture.');
      img = this.createFallbackPaintingCanvas();
    }

    if (img instanceof HTMLImageElement) {
      this.imageElement = img;
    }

    if (this.texture) {
      gl.deleteTexture(this.texture);
    }

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    // Upload image or canvas to texture
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      img
    );

    // Linear filtering for smooth brushstroke interpolation
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    this.texture = texture;
    this.isLoaded = true;
    return true;
  }

  private createFallbackPaintingCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    // Dark moody sculptural impasto oil painting palette
    const bgGrad = ctx.createLinearGradient(0, 0, 1080, 1920);
    bgGrad.addColorStop(0, '#1a2421');
    bgGrad.addColorStop(0.3, '#0d1814');
    bgGrad.addColorStop(0.7, '#16221d');
    bgGrad.addColorStop(1, '#090d0b');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1080, 1920);

    const colors = [
      'rgba(46, 76, 62, 0.45)',
      'rgba(30, 56, 44, 0.55)',
      'rgba(65, 107, 86, 0.35)',
      'rgba(18, 38, 28, 0.65)',
      'rgba(82, 134, 108, 0.25)',
      'rgba(26, 48, 38, 0.5)',
    ];

    for (let i = 0; i < 40; i++) {
      const y = (i / 40) * 1920;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= 1080; x += 60) {
        const wave = Math.sin((x / 180) + i * 0.4) * 60 + Math.cos((x / 240) + i * 0.3) * 40;
        ctx.lineTo(x, y + wave);
      }
      ctx.strokeStyle = colors[i % colors.length];
      ctx.lineWidth = 45 + (i % 5) * 12;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    return canvas;
  }

  public render(uniforms: ShaderUniforms) {
    const gl = this.gl;
    if (!gl || !this.program || !this.texture || !this.isLoaded) return;

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);

    // Bind position quad
    const posAttr = gl.getAttribLocation(this.program, 'a_position');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(posAttr);
    gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

    // Bind texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.uniformLocations['u_texture'], 0);

    // Pass uniforms
    gl.uniform1f(this.uniformLocations['u_time'], uniforms.time);
    gl.uniform1f(this.uniformLocations['u_loopDuration'], uniforms.loopDuration);
    gl.uniform3f(
      this.uniformLocations['u_lightPos'],
      uniforms.lightPos[0],
      uniforms.lightPos[1],
      uniforms.lightPos[2]
    );
    gl.uniform1f(this.uniformLocations['u_lightIntensity'], uniforms.lightIntensity);
    gl.uniform1f(this.uniformLocations['u_beamRadius'], uniforms.beamRadius);
    gl.uniform1f(this.uniformLocations['u_impastoDepth'], uniforms.impastoDepth);
    gl.uniform1f(this.uniformLocations['u_breezeStrength'], uniforms.breezeStrength);
    gl.uniform1f(this.uniformLocations['u_ambientLevel'], uniforms.ambientLevel);
    gl.uniform1f(this.uniformLocations['u_specularPower'], uniforms.specularPower);
    gl.uniform1f(this.uniformLocations['u_specularStrength'], uniforms.specularStrength);
    gl.uniform2f(
      this.uniformLocations['u_resolution'],
      this.canvas.width,
      this.canvas.height
    );

    // Draw full screen quad
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  public destroy() {
    const gl = this.gl;
    if (!gl) return;
    if (this.texture) gl.deleteTexture(this.texture);
    if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer);
    if (this.program) gl.deleteProgram(this.program);
    this.isLoaded = false;
  }
}
