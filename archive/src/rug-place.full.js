/* globals THREE, XR8 */

import { createFloorGrid } from './floor-grid'
import { initWorldMeshOccluder } from './world-mesh-occluder'

const RUG_WIDTH       = 3
const RUG_DEPTH       = 4
const RUG_HEIGHT      = 0.02
const OCCLUDER_HEIGHT = 1.5   // metres — typical furniture height

let selectedTextureSrc = 'assets/textures/Easther (Visualization).jpg'
let placedRug    = null
let floorGrid    = null
let floorY       = 0

// Touch tracking — needed to feed correct coords into XR8.XrController.hitTest()
let lastTouchX = 0
let lastTouchY = 0

// Furniture marking state
let furnitureMode = false
let cornerA       = null   // first tap {x,y,z}
let cornerADot    = null   // small sphere showing first corner
const occluderBoxes = []

let _occluderMat = null
function getOccluderMat() {
  if (!_occluderMat) {
    _occluderMat = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: true,
      depthTest: true,
      side: THREE.DoubleSide,
    })
  }
  return _occluderMat
}

let textureLoadSeq = 0
let pendingListener = null
let pendingEl = null

function applyTextureToRug(rugEl, src) {
  const seq = ++textureLoadSeq
  new THREE.TextureLoader().load(src, (texture) => {
    if (seq !== textureLoadSeq) return
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.encoding = THREE.sRGBEncoding
    const mesh = rugEl.getObject3D('mesh')
    if (mesh) {
      setMaterial(mesh, texture)
    } else {
      if (pendingListener && pendingEl) pendingEl.removeEventListener('object3dset', pendingListener)
      pendingListener = () => {
        pendingListener = null; pendingEl = null
        const m = rugEl.getObject3D('mesh')
        if (m) setMaterial(m, texture)
      }
      pendingEl = rugEl
      rugEl.addEventListener('object3dset', pendingListener, { once: true })
    }
  })
}

function setMaterial(mesh, texture) {
  mesh.traverse((node) => {
    if (!node.isMesh) return
    node.material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.9,
      metalness: 0.0,
      side: THREE.DoubleSide,
    })
    node.material.needsUpdate = true
  })
}

// XR8 hit test — falls back to raycaster point if tracking not ready
function hitTest(clientX, clientY, fallback) {
  if (window.XR8 && XR8.XrController && XR8.XrController.hitTest) {
    try {
      const hits = XR8.XrController.hitTest(
        clientX / window.innerWidth,
        clientY / window.innerHeight,
        ['FEATURE_POINT', 'PLANE'],
      )
      if (hits.length > 0) return hits[0].position
    } catch (_) {}
  }
  return fallback
}

function placeFurnitureOccluder(threeScene, a, b) {
  const w  = Math.max(Math.abs(b.x - a.x), 0.3)
  const d  = Math.max(Math.abs(b.z - a.z), 0.3)
  const cx = (a.x + b.x) / 2
  const cz = (a.z + b.z) / 2
  const fy = Math.min(a.y, b.y)
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(w, OCCLUDER_HEIGHT, d),
    getOccluderMat(),
  )
  box.position.set(cx, fy + OCCLUDER_HEIGHT / 2, cz)
  box.renderOrder = -1
  threeScene.add(box)
  occluderBoxes.push(box)
}

const rugPlaceComponent = {
  init() {
    const scene      = this.el.sceneEl
    const threeScene = scene.object3D

    const ground       = document.getElementById('ground')
    const designPanel  = document.getElementById('design-panel')
    const togglePanel  = document.getElementById('toggle-panel')
    const removeBtn    = document.getElementById('remove-btn')
    const uploadBtn    = document.getElementById('upload-btn')
    const fileInput    = document.getElementById('file-input')
    const placeBtn     = document.getElementById('place-btn')
    const furnitureBtn = document.getElementById('furniture-btn')
    const scanOverlay  = document.getElementById('scan-overlay')

    if (scanOverlay) scanOverlay.style.display = 'none'
    designPanel.style.display = 'block'
    togglePanel.style.display = 'flex'

    // Floor grid
    floorGrid = createFloorGrid()
    threeScene.add(floorGrid.mesh)
    floorGrid.show(0)

    // SLAM world mesh → depth-only occluder
    initWorldMeshOccluder(threeScene)

    // Track touch position for XR8 hit test
    document.addEventListener('touchstart', (e) => {
      const t = e.touches[0]
      if (t) { lastTouchX = t.clientX; lastTouchY = t.clientY }
    }, { passive: true })

    // ── Floor tap (rug placement or furniture corner) ────────────────────────
    ground.addEventListener('click', (event) => {
      const fp = event.detail.intersection.point
      const pos = hitTest(lastTouchX, lastTouchY, { x: fp.x, y: fp.y, z: fp.z })

      if (furnitureMode) {
        if (!cornerA) {
          // First corner — drop a marker sphere
          cornerA = { ...pos }
          const dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.05, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xff6b35 }),
          )
          dot.position.set(pos.x, pos.y + 0.06, pos.z)
          threeScene.add(dot)
          cornerADot = dot
        } else {
          // Second corner — create the occluder box
          placeFurnitureOccluder(threeScene, cornerA, pos)
          threeScene.remove(cornerADot)
          cornerADot = null
          cornerA = null
        }
        return
      }

      // ── Rug mode ────────────────────────────────────────────────────────────
      floorY = pos.y
      floorGrid.setFloorY(floorY)

      if (placedRug) {
        placedRug.setAttribute('position', {
          x: pos.x,
          y: floorY + RUG_HEIGHT / 2 + 0.01,
          z: pos.z,
        })
        return
      }

      const rug = document.createElement('a-entity')
      rug.setAttribute('class', 'cantap')
      rug.setAttribute('position', { x: pos.x, y: floorY + RUG_HEIGHT / 2 + 0.01, z: pos.z })
      rug.setAttribute('geometry', { primitive: 'box', width: RUG_WIDTH, height: RUG_HEIGHT, depth: RUG_DEPTH })
      rug.setAttribute('shadow', { receive: false, cast: true })
      rug.setAttribute('visible', 'false')
      rug.setAttribute('scale', '0.001 0.001 0.001')
      rug.setAttribute('xrextras-hold-drag', '')
      rug.setAttribute('xrextras-two-finger-rotate', '')
      rug.setAttribute('xrextras-pinch-scale', '')

      scene.appendChild(rug)
      applyTextureToRug(rug, selectedTextureSrc)
      rug.setAttribute('visible', 'true')
      rug.setAttribute('animation', { property: 'scale', to: '1 1 1', easing: 'easeOutBack', dur: 800 })

      placedRug = rug
      removeBtn.style.display = 'block'
      placeBtn.textContent = 'Tap to Reposition'
      floorGrid.hide()
    })

    // ── Design gallery ───────────────────────────────────────────────────────
    document.querySelectorAll('.design-thumb').forEach((thumb) => {
      thumb.addEventListener('click', () => {
        document.querySelectorAll('.design-thumb, .upload-thumb').forEach(t => t.classList.remove('selected'))
        thumb.classList.add('selected')
        selectedTextureSrc = thumb.getAttribute('data-texture')
        if (placedRug) applyTextureToRug(placedRug, selectedTextureSrc)
      })
    })

    uploadBtn.addEventListener('click', () => fileInput.click())

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        const dataUrl = ev.target.result
        document.querySelectorAll('.design-thumb, .upload-thumb').forEach(t => t.classList.remove('selected'))
        uploadBtn.classList.add('selected')
        selectedTextureSrc = dataUrl
        uploadBtn.innerHTML = ''
        const img = document.createElement('img')
        img.src = dataUrl; img.alt = 'Custom'
        uploadBtn.appendChild(img)
        if (placedRug) applyTextureToRug(placedRug, selectedTextureSrc)
      }
      reader.readAsDataURL(file)
    })

    // ── Remove rug ───────────────────────────────────────────────────────────
    removeBtn.addEventListener('click', () => {
      if (!placedRug) return
      placedRug.parentNode.removeChild(placedRug)
      placedRug = null
      removeBtn.style.display = 'none'
      placeBtn.textContent = 'Tap Floor to Place Rug'
      floorGrid.show(floorY)
    })

    // ── Toggle design panel ──────────────────────────────────────────────────
    togglePanel.addEventListener('click', () => {
      designPanel.style.display = designPanel.style.display !== 'none' ? 'none' : 'block'
    })

    // ── Furniture marking mode ───────────────────────────────────────────────
    furnitureBtn.addEventListener('click', () => {
      furnitureMode = !furnitureMode
      if (furnitureMode) {
        furnitureBtn.textContent = 'Done Marking'
        furnitureBtn.classList.add('active')
        // Cancel any in-progress corner
        cornerA = null
        if (cornerADot) { threeScene.remove(cornerADot); cornerADot = null }
      } else {
        furnitureBtn.textContent = 'Mark Furniture'
        furnitureBtn.classList.remove('active')
        if (cornerADot) { threeScene.remove(cornerADot); cornerADot = null }
        cornerA = null
      }
    })
  },

  tick() {
    if (!floorGrid || !floorGrid.mesh.visible) return
    const cam = this.el.camera
    if (cam) floorGrid.updateCamera(cam.position.x, cam.position.z)
  },

  remove() {
    if (floorGrid) {
      this.el.sceneEl.object3D.remove(floorGrid.mesh)
      floorGrid.mesh.geometry.dispose()
      floorGrid.mesh.material.dispose()
      floorGrid = null
    }
    occluderBoxes.forEach((b) => {
      this.el.sceneEl.object3D.remove(b)
      b.geometry.dispose()
    })
    occluderBoxes.length = 0
    if (_occluderMat) { _occluderMat.dispose(); _occluderMat = null }
  },
}

export { rugPlaceComponent }
