/* globals THREE */

export function createOcclusionRugMaterial({ map, width, height }) {
  const maskData = new Uint8Array(width * height * 4)
  maskData.fill(255)
  const maskTexture = new THREE.DataTexture(
    maskData, width, height,
    THREE.RGBAFormat, THREE.UnsignedByteType,
  )
  maskTexture.flipY = false
  maskTexture.needsUpdate = true

  const resolution = new THREE.Vector2(1920, 1080)

  const material = new THREE.MeshStandardMaterial({
    map,
    roughness: 0.9,
    metalness: 0.0,
    side: THREE.DoubleSide,
  })

  material.onBeforeCompile = (shader) => {
    shader.uniforms.occlusionMask = { value: maskTexture }
    shader.uniforms.occlusionRes = { value: resolution }

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        [
          '#include <common>',
          'uniform sampler2D occlusionMask;',
          'uniform vec2 occlusionRes;',
        ].join('\n'),
      )

    // THREE r152+: gl_FragColor lives inside <opaque_fragment>, not inline.
    // Inject discard before that chunk so it works across versions.
    // Y-axis is inverted: DataTexture row-0 = WebGL bottom, so flip in shader.
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <opaque_fragment>',
        [
          'vec2 screenUV = vec2(gl_FragCoord.x, occlusionRes.y - gl_FragCoord.y) / occlusionRes;',
          'float occ = texture2D(occlusionMask, screenUV).r;',
          'if (occ > 0.5) discard;',
          '#include <opaque_fragment>',
        ].join('\n'),
      )
  }
  material.needsUpdate = true

  return { material, maskTexture, maskData, resolution }
}
