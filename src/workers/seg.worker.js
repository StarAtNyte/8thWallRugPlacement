import * as ort from 'onnxruntime-web'

let session = null
const MODEL_W = 640
const MODEL_H = 640
const FURNITURE_CLASSES = new Set([56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90])

self.onmessage = async (e) => {
  const { type, id, payload } = e.data

  if (type === 'init') {
    ort.env.wasm.wasmPaths = payload.wasmPath
    try {
      session = await ort.InferenceSession.create(payload.modelUrl, {
        executionProviders: ['wasm'],
      })
      self.postMessage({ type: 'ready', id })
    } catch (err) {
      self.postMessage({ type: 'error', id, error: err.message })
    }
    return
  }

  if (type === 'infer') {
    if (!session) {
      self.postMessage({ type: 'error', id, error: 'seg model not loaded' })
      return
    }
    const { pixels, width, height } = payload
    const resized = resizeToModel(pixels, width, height)
    const tensor = new ort.Tensor('float32', resized.data, [1, 3, MODEL_H, MODEL_W])
    const feeds = { [session.inputNames[0]]: tensor }
    const results = await session.run(feeds)

    const mask = postprocess(results, width, height)
    self.postMessage({ type: 'result', id, mask: mask.buffer, width, height }, [mask.buffer])
  }
}

function resizeToModel(pixels, srcW, srcH) {
  const data = new Float32Array(3 * MODEL_H * MODEL_W)
  const xScale = srcW / MODEL_W
  const yScale = srcH / MODEL_H
  for (let dy = 0; dy < MODEL_H; dy++) {
    for (let dx = 0; dx < MODEL_W; dx++) {
      const sx = dx * xScale
      const sy = dy * yScale
      const ix = Math.min(Math.floor(sx), srcW - 1)
      const iy = Math.min(Math.floor(sy), srcH - 1)
      const srcIdx = (iy * srcW + ix) * 4
      const dstIdx = dy * MODEL_W + dx
      data[dstIdx] = pixels[srcIdx] / 255.0
      data[MODEL_H * MODEL_W + dstIdx] = pixels[srcIdx + 1] / 255.0
      data[2 * MODEL_H * MODEL_W + dstIdx] = pixels[srcIdx + 2] / 255.0
    }
  }
  return data
}

function postprocess(outputs, width, height) {
  const dets = outputs[session.outputNames[0]] // [1, 116, 8400]
  const protos = outputs[session.outputNames[1]] // [1, 32, 160, 160]
  const mask = new Uint8Array(width * height)

  const numDets = dets.dims[2]
  const detData = dets.data
  const protoData = protos.data
  const protoH = protos.dims[2]
  const protoW = protos.dims[3]

  const boxes = []
  for (let i = 0; i < numDets; i++) {
    const offset = i * 116
    const cx = detData[offset]
    const cy = detData[offset + 1]
    const bw = detData[offset + 2]
    const bh = detData[offset + 3]

    let maxScore = 0
    let bestCls = -1
    for (let c = 0; c < 80; c++) {
      const s = detData[offset + 4 + c]
      if (s > maxScore) { maxScore = s; bestCls = c }
    }
    if (maxScore < 0.5) continue
    if (!FURNITURE_CLASSES.has(bestCls + 1)) continue

    const coeffs = detData.slice(offset + 84, offset + 116)
    boxes.push({ cx, cy, bw, bh, score: maxScore, cls: bestCls, coeffs })
  }

  const keep = nms(boxes, 0.5)
  for (const idx of keep) {
    const b = boxes[idx]
    const maskMap = new Float32Array(protoH * protoW)
    for (let p = 0; p < protoH * protoW; p++) {
      let sum = 0
      for (let c = 0; c < 32; c++) {
        sum += b.coeffs[c] * protoData[c * protoH * protoW + p]
      }
      maskMap[p] = 1 / (1 + Math.exp(-sum))
    }

    const scaleX = width / MODEL_W
    const scaleY = height / MODEL_H
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const mx = (x / scaleX) / MODEL_W * protoW
        const my = (y / scaleY) / MODEL_H * protoH
        const px = Math.min(Math.floor(mx), protoW - 1)
        const py = Math.min(Math.floor(my), protoH - 1)
        if (maskMap[py * protoW + px] > 0.5) {
          mask[y * width + x] = 1
        }
      }
    }
  }

  return mask
}

function nms(boxes, iouThresh) {
  if (!boxes.length) return []
  const sorted = boxes.map((b, i) => ({ i, score: b.score })).sort((a, b) => b.score - a.score)
  const keep = []
  const suppressed = new Array(boxes.length).fill(false)
  for (const a of sorted) {
    if (suppressed[a.i]) continue
    keep.push(a.i)
    for (const b of sorted) {
      if (suppressed[b.i]) continue
      const iou = computeIoU(boxes[a.i], boxes[b.i])
      if (iou > iouThresh) suppressed[b.i] = true
    }
  }
  return keep
}

function computeIoU(a, b) {
  const ax1 = a.cx - a.bw / 2; const ay1 = a.cy - a.bh / 2
  const ax2 = a.cx + a.bw / 2; const ay2 = a.cy + a.bh / 2
  const bx1 = b.cx - b.bw / 2; const by1 = b.cy - b.bh / 2
  const bx2 = b.cx + b.bw / 2; const by2 = b.cy + b.bh / 2
  const ix1 = Math.max(ax1, bx1); const iy1 = Math.max(ay1, by1)
  const ix2 = Math.min(ax2, bx2); const iy2 = Math.min(ay2, by2)
  const iw = Math.max(0, ix2 - ix1); const ih = Math.max(0, iy2 - iy1)
  const inter = iw * ih
  const areaA = a.bw * a.bh
  const areaB = b.bw * b.bh
  return inter / (areaA + areaB - inter)
}
