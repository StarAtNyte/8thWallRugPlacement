/* globals THREE */

const RUG_WIDTH = 3    // 900:1200 = 3:4 aspect ratio
const RUG_DEPTH = 4
const RUG_HEIGHT = 0.02

let selectedTextureSrc = 'assets/textures/Easther (Visualization).jpg'
let placedRug = null

function applyTextureToRug(rugEl, src) {
  const textureLoader = new THREE.TextureLoader()
  textureLoader.load(src, (texture) => {
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.encoding = THREE.sRGBEncoding

    const mesh = rugEl.getObject3D('mesh')
    if (mesh) {
      mesh.traverse((node) => {
        if (node.isMesh) {
          node.material = new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.9,
            metalness: 0.0,
          })
          node.material.needsUpdate = true
        }
      })
    } else {
      rugEl.addEventListener('object3dset', () => {
        const m = rugEl.getObject3D('mesh')
        if (m) {
          m.traverse((node) => {
            if (node.isMesh) {
              node.material = new THREE.MeshStandardMaterial({
                map: texture,
                roughness: 0.9,
                metalness: 0.0,
              })
              node.material.needsUpdate = true
            }
          })
        }
      }, {once: true})
    }
  })
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
      rug.setAttribute('shadow', {receive: false, cast: true})
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
}

export {rugPlaceComponent}
