/* globals THREE, XR8 */

export function initWorldMeshOccluder(scene) {
  const mat = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
  })

  const meshMap = new Map()

  const pipelineModule = {
    name: 'world-mesh-occluder',

    onMeshFound({ id, geometry, position, rotation }) {
      console.log('[WorldMesh] mesh found:', id)
      const mesh = new THREE.Mesh(geometry, mat)
      mesh.renderOrder = -1
      _applyTransform(mesh, position, rotation)
      scene.add(mesh)
      meshMap.set(id, mesh)
    },

    onMeshUpdated({ id, geometry, position, rotation }) {
      const mesh = meshMap.get(id)
      if (!mesh) return
      if (geometry) { mesh.geometry.dispose(); mesh.geometry = geometry }
      _applyTransform(mesh, position, rotation)
    },

    onMeshLost({ id }) {
      const mesh = meshMap.get(id)
      if (!mesh) return
      scene.remove(mesh)
      mesh.geometry.dispose()
      meshMap.delete(id)
    },
  }

  function _applyTransform(mesh, position, rotation) {
    if (position) mesh.position.set(position.x, position.y, position.z)
    if (rotation) mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w)
  }

  const register = () => XR8.addCameraPipelineModules([pipelineModule])
  if (window.XR8) register()
  else window.addEventListener('xrloaded', register, { once: true })

  return {
    dispose() {
      meshMap.forEach((m) => { scene.remove(m); m.geometry.dispose() })
      meshMap.clear()
      mat.dispose()
    },
  }
}
