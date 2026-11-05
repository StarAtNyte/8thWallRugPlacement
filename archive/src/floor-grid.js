/* globals THREE */

const SIZE        = 300   // plane width/height in metres — large enough to never see the edge
const FADE_START  = 6     // metres from camera where grid starts fading
const FADE_END    = 14    // metres from camera where grid is fully invisible
const CELL_SIZE   = 0.5   // metres per cell

export function createFloorGrid() {
  const geometry = new THREE.PlaneGeometry(SIZE, SIZE, 1, 1)
  geometry.rotateX(-Math.PI / 2)

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uColor:      { value: new THREE.Color(0x00d4ff) },
      uOpacity:    { value: 0.0 },
      uCellSize:   { value: CELL_SIZE },
      uCamXZ:      { value: new THREE.Vector2(0, 0) },
      uFadeStart:  { value: FADE_START },
      uFadeEnd:    { value: FADE_END },
    },
    vertexShader: /* glsl */`
      varying vec2 vWorldXZ;
      void main() {
        vec4 w  = modelMatrix * vec4(position, 1.0);
        vWorldXZ = w.xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3  uColor;
      uniform float uOpacity;
      uniform float uCellSize;
      uniform vec2  uCamXZ;
      uniform float uFadeStart;
      uniform float uFadeEnd;
      varying vec2  vWorldXZ;

      void main() {
        // Grid lines — world-space so they don't swim as the plane moves
        vec2  coord = vWorldXZ / uCellSize;
        vec2  g     = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
        float line  = 1.0 - min(min(g.x, g.y), 1.0);

        // Slightly thicker axis lines
        vec2  axisD = abs(vWorldXZ) / (fwidth(vWorldXZ) * uCellSize * 0.5);
        float axis  = (1.0 - min(min(axisD.x, axisD.y), 1.0)) * 0.5;
        line = max(line, axis);

        // Radial fade centred on camera (not mesh centre)
        float dist = length(vWorldXZ - uCamXZ);
        float fade = 1.0 - smoothstep(uFadeStart, uFadeEnd, dist);

        gl_FragColor = vec4(uColor, line * fade * uOpacity);
        if (gl_FragColor.a < 0.005) discard;
      }
    `,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.renderOrder = -1
  mesh.visible = false

  // Call every frame from tick() — keeps the infinite illusion
  function updateCamera(camX, camZ, floorY) {
    mesh.position.x = camX
    mesh.position.z = camZ
    if (floorY !== undefined) mesh.position.y = floorY + 0.003
    material.uniforms.uCamXZ.value.set(camX, camZ)
  }

  function show(floorY = 0) {
    mesh.position.y = floorY + 0.003
    mesh.visible = true
    _fade(material, 0, 0.9, 600)
  }

  function hide(cb) {
    _fade(material, material.uniforms.uOpacity.value, 0, 400, () => {
      mesh.visible = false
      if (cb) cb()
    })
  }

  function setFloorY(y) {
    mesh.position.y = y + 0.003
  }

  return { mesh, show, hide, updateCamera, setFloorY }
}

function _fade(material, from, to, ms, done) {
  const start = performance.now()
  function step() {
    const t = Math.min((performance.now() - start) / ms, 1)
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
    material.uniforms.uOpacity.value = from + (to - from) * ease
    if (t < 1) requestAnimationFrame(step)
    else if (done) done()
  }
  requestAnimationFrame(step)
}
