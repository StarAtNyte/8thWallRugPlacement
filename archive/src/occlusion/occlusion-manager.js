import { erode } from './fusion'

const DEV = process.env.NODE_ENV === 'development'

function devLog(msg, level = 'log') {
  if (!DEV) return
  fetch('/dev-log', {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level, msg }),
  }).catch(() => {})
}

const DEFAULT_OPTIONS = {
  internalWidth: 320,
  internalHeight: 240,
  wasmPath: '/external/wasm/',
  modelPaths: {
    encoder: '/external/models/edge_sam_3x_encoder.onnx',
    decoder: '/external/models/edge_sam_3x_decoder.onnx',
  },
}

export class OcclusionManager {
  constructor(video, options = {}) {
    this.video = video
    this.opts = { ...DEFAULT_OPTIONS, ...options }

    this.ready = false

    this.canvas = document.createElement('canvas')
    this.canvas.width = this.opts.internalWidth
    this.canvas.height = this.opts.internalHeight
    this.ctx = this.canvas.getContext('2d')

    this.maskPixels = new Uint8Array(this.opts.internalWidth * this.opts.internalHeight)
    this.maskDirty = false

    // Scale factor: video frame coords → encoder input (1024×1024) coords
    this._encodeScale = 1024 / Math.max(this.opts.internalWidth, this.opts.internalHeight)

    this._msgId = 0
    this._pending = new Map()
    this._encoderWorker = null
    this._decoderWorker = null
    this._decodeInFlight = false
  }

  async init() {
    this._encoderWorker = new Worker(new URL('../workers/encoder.worker.js', import.meta.url))
    this._decoderWorker = new Worker(new URL('../workers/decoder.worker.js', import.meta.url))

    await Promise.all([
      this._initWorker(this._encoderWorker, this.opts.modelPaths.encoder)
        .then(() => devLog('[Occlusion] encoder ready'))
        .catch((err) => { devLog(`[Occlusion] encoder failed: ${err.message}`, 'error'); throw err }),
      this._initWorker(this._decoderWorker, this.opts.modelPaths.decoder)
        .then((data) => devLog(`[Occlusion] decoder ready — inputs: ${data?.inputNames?.join(', ')} | outputs: ${data?.outputNames?.join(', ')}`))
        .catch((err) => { devLog(`[Occlusion] decoder failed: ${err.message}`, 'error'); throw err }),
    ])

    this._encoderWorker.onmessage = (e) => this._onMsg(e)
    this._decoderWorker.onmessage = (e) => this._onMsg(e)

    this.ready = true
    devLog('[Occlusion] ready')
  }

  _initWorker(worker, modelUrl) {
    return new Promise((resolve, reject) => {
      worker.onmessage = (e) => {
        if (e.data.type === 'ready') resolve(e.data)
        if (e.data.type === 'error') reject(new Error(e.data.error))
      }
      worker.postMessage({ type: 'init', payload: { wasmPath: this.opts.wasmPath, modelUrl } })
    })
  }

  _onMsg(e) {
    const { type, id } = e.data
    if (!this._pending.has(id)) return
    const { resolve, reject } = this._pending.get(id)
    this._pending.delete(id)
    if (type === 'result') resolve(e.data)
    else reject(new Error(e.data.error || 'worker error'))
  }

  _send(worker, msg, transfer = []) {
    const id = this._msgId++
    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject })
      worker.postMessage({ ...msg, id }, transfer)
    })
  }

  async captureAndEncode() {
    const w = this.opts.internalWidth
    const h = this.opts.internalHeight
    this.ctx.drawImage(this.video, 0, 0, w, h)
    const { data: pixels } = this.ctx.getImageData(0, 0, w, h)

    const t0 = DEV ? performance.now() : 0
    const encResult = await this._send(this._encoderWorker, {
      type: 'encode',
      payload: { pixels, width: w, height: h },
    })
    devLog(`[Occlusion] encoded in ${(performance.now() - t0).toFixed(0)}ms`)

    // Cache embedding in decoder worker — avoids copying 4MB on every tap
    await this._send(
      this._decoderWorker,
      { type: 'setEmbedding', payload: { embeddingBuffer: encResult.embedding } },
      [encResult.embedding],
    )
  }

  async decodePoint(videoX, videoY) {
    if (this._decodeInFlight) return null
    this._decodeInFlight = true

    const w = this.opts.internalWidth
    const h = this.opts.internalHeight
    const pointX = videoX * this._encodeScale
    const pointY = videoY * this._encodeScale

    const t0 = DEV ? performance.now() : 0
    try {
      const result = await this._send(this._decoderWorker, {
        type: 'decode',
        payload: { pointX, pointY, origW: w, origH: h },
      })
      devLog(`[Occlusion] decoded in ${(performance.now() - t0).toFixed(0)}ms`)

      const fused = erode(new Uint8Array(result.mask), w, h, 1)
      let changed = false
      for (let i = 0; i < fused.length; i++) {
        if (fused[i] && !this.maskPixels[i]) {
          this.maskPixels[i] = 1
          changed = true
        }
      }
      if (changed) this.maskDirty = true
      return fused
    } catch (err) {
      devLog(`[Occlusion] decode error: ${err.message}`, 'error')
      return null
    } finally {
      this._decodeInFlight = false
    }
  }

  clearMask() {
    this.maskPixels.fill(0)
    this.maskDirty = true
  }

  readMask(dst, dstW, dstH) {
    if (!this.maskDirty) return
    const srcW = this.opts.internalWidth
    const srcH = this.opts.internalHeight
    for (let y = 0; y < dstH; y++) {
      for (let x = 0; x < dstW; x++) {
        const sx = Math.floor((x / dstW) * srcW)
        const sy = Math.floor((y / dstH) * srcH)
        const val = this.maskPixels[sy * srcW + sx]
        const di = (y * dstW + x) * 4
        dst[di] = val * 255
        dst[di + 1] = val * 255
        dst[di + 2] = val * 255
        dst[di + 3] = 255
      }
    }
    this.maskDirty = false
  }

  destroy() {
    this.ready = false
    this._encoderWorker?.terminate()
    this._decoderWorker?.terminate()
    for (const { reject } of this._pending.values()) {
      reject(new Error('OcclusionManager destroyed'))
    }
    this._pending.clear()
  }
}
