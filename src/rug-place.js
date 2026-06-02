/* globals THREE */

import { OcclusionManager } from './occlusion/occlusion-manager'
import { createOcclusionRugMaterial } from './occlusion/rug-material'

const RUG_WIDTH = 3
const RUG_DEPTH = 4
const RUG_HEIGHT = 0.02
const MASK_W = 320
const MASK_H = 240

let selectedTextureSrc = 'assets/textures/Easther (Visualization).jpg'
let placedRug = null
let occlusionManager = null
let currentRugMaterial = null
let currentMaskTexture = null
let currentMaskData = null
let currentResolution = null

let textureLoadSeq = 0
let pendingObject3dListener = null
let pendingObject3dEl = null

function waitForVideo(callback) {
  const existing = document.querySelector('video')
  if (existing) { callback(existing); return }
  const observer = new MutationObserver(() => {
    const video = document.querySelector('video')
    if (video) { observer.disconnect(); callback(video) }
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

function applyTextureToRug(rugEl, src) {
  const seq = ++textureLoadSeq
  const textureLoader = new THREE.TextureLoader()
  textureLoader.load(src, (texture) => {
    if (seq !== textureLoadSeq) return
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.encoding = THREE.sRGBEncoding

    const mesh = rugEl.getObject3D('mesh')
    if (mesh) {
      setRugMaterial(mesh, texture)
    } else {
      if (pendingObject3dListener && pendingObject3dEl) {
        pendingObject3dEl.removeEventListener('object3dset', pendingObject3dListener)
      }
      pendingObject3dListener = () => {
        pendingObject3dListener = null
        pendingObject3dEl = null
        const m = rugEl.getObject3D('mesh')
        if (m) setRugMaterial(m, texture)
      }
      pendingObject3dEl = rugEl
      rugEl.addEventListener('object3dset', pendingObject3dListener, { once: true })
    }
  })
}

function setRugMaterial(mesh, texture) {
  // Dispose old resources before creating new ones
  if (currentMaskTexture) currentMaskTexture.dispose()
  if (currentRugMaterial) currentRugMaterial.dispose()
  currentRugMaterial = null
  currentMaskTexture = null

  // Apply only to first isMesh node — avoids dispose-on-multi-mesh bug
  mesh.traverse((node) => {
    if (node.isMesh && !currentRugMaterial) {
      const { material, maskTexture, maskData, resolution } = createOcclusionRugMaterial({
        map: texture,
        width: MASK_W,
        height: MASK_H,
      })
      node.material = material
      node.material.needsUpdate = true
      currentRugMaterial = material
      currentMaskTexture = maskTexture
      currentMaskData = maskData
      currentResolution = resolution
    }
  })
}

function updateOcclusionMask() {
  if (!currentMaskTexture || !occlusionManager) return
  occlusionManager.readMask(currentMaskData, MASK_W, MASK_H)
  currentMaskTexture.needsUpdate = true
}

const rugPlaceComponent = {
  init() {
    const scene = this.el.sceneEl
    const ground = document.getElementById('ground')
    const designPanel = document.getElementById('design-panel')
    const togglePanel = document.getElementById('toggle-panel')
    const removeBtn = document.getElementById('remove-btn')
    const uploadBtn = document.getElementById('upload-btn')
    const fileInput = document.getElementById('file-input')
    const placeBtn = document.getElementById('place-btn')

    waitForVideo((video) => {
      occlusionManager = new OcclusionManager(video, {
        internalWidth: MASK_W,
        internalHeight: MASK_H,
      })
      occlusionManager.init().catch(err => console.error('OcclusionManager init failed:', err))
    })

    togglePanel.addEventListener('click', () => {
      const isVisible = designPanel.style.display !== 'none'
      designPanel.style.display = isVisible ? 'none' : 'block'
    })

    document.querySelectorAll('.design-thumb').forEach((thumb) => {
      thumb.addEventListener('click', () => {
        document.querySelectorAll('.design-thumb, .upload-thumb').forEach(t => t.classList.remove('selected'))
        thumb.classList.add('selected')
        selectedTextureSrc = thumb.getAttribute('data-texture')
        if (placedRug) {
          applyTextureToRug(placedRug, selectedTextureSrc)
        }
      })
    })

    uploadBtn.addEventListener('click', () => {
      fileInput.click()
    })

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
        img.src = dataUrl
        img.alt = 'Custom'
        uploadBtn.appendChild(img)
        if (placedRug) {
          applyTextureToRug(placedRug, selectedTextureSrc)
        }
      }
      reader.readAsDataURL(file)
    })

    removeBtn.addEventListener('click', () => {
      if (placedRug) {
        placedRug.parentNode.removeChild(placedRug)
        placedRug = null
        if (currentMaskTexture) {
          currentMaskTexture.dispose()
          currentMaskTexture = null
        }
        if (currentRugMaterial) {
          currentRugMaterial.dispose()
          currentRugMaterial = null
        }
        currentMaskData = null
        currentResolution = null
        removeBtn.style.display = 'none'
        placeBtn.textContent = 'Tap Floor to Place Rug'
      }
    })

    ground.addEventListener('click', (event) => {
      const touchPoint = event.detail.intersection.point

      if (placedRug) {
        placedRug.setAttribute('position', {
          x: touchPoint.x,
          y: touchPoint.y + (RUG_HEIGHT / 2) + 0.01,
          z: touchPoint.z,
        })
        return
      }

      const rug = document.createElement('a-entity')
      rug.setAttribute('class', 'cantap')
      rug.setAttribute('position', {
        x: touchPoint.x,
        y: touchPoint.y + (RUG_HEIGHT / 2) + 0.01,
        z: touchPoint.z,
      })
      rug.setAttribute('geometry', {
        primitive: 'box',
        width: RUG_WIDTH,
        height: RUG_HEIGHT,
        depth: RUG_DEPTH,
      })
      rug.setAttribute('shadow', { receive: false, cast: true })
      rug.setAttribute('visible', 'false')
      rug.setAttribute('scale', '0.001 0.001 0.001')
      rug.setAttribute('xrextras-hold-drag', '')
      rug.setAttribute('xrextras-two-finger-rotate', '')
      rug.setAttribute('xrextras-pinch-scale', '')

      scene.appendChild(rug)
      applyTextureToRug(rug, selectedTextureSrc)

      rug.setAttribute('visible', 'true')
      rug.setAttribute('animation', {
        property: 'scale',
        to: '1 1 1',
        easing: 'easeOutElastic',
        dur: 800,
      })

      placedRug = rug
      removeBtn.style.display = 'block'
      placeBtn.textContent = 'Tap to Reposition Rug'
    })
  },

  tick() {
    if (!occlusionManager || !occlusionManager.ready) return

    const canvas = this.el.sceneEl?.canvas
    if (canvas && canvas.width > 0 && canvas.height > 0 && currentResolution) {
      currentResolution.set(canvas.width, canvas.height)
    }

    occlusionManager.processFrame()
    if (occlusionManager.maskDirty) {
      updateOcclusionMask()
    }
  },

  remove() {
    occlusionManager?.destroy()
    occlusionManager = null
  },
}

export { rugPlaceComponent }
