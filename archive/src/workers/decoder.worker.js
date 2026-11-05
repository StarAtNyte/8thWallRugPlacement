import * as ort from 'onnxruntime-web'

let session = null
let cachedEmbedding = null

self.onmessage = async (e) => {
  const { type, id, payload } = e.data

  if (type === 'init') {
    ort.env.wasm.wasmPaths = payload.wasmPath
    try {
      session = await ort.InferenceSession.create(payload.modelUrl, { executionProviders: ['wasm'] })
      self.postMessage({ type: 'ready', inputNames: session.inputNames, outputNames: session.outputNames })
    } catch (err) {
      self.postMessage({ type: 'error', error: err.message })
    }
    return
  }

  if (type === 'setEmbedding') {
    cachedEmbedding = new Float32Array(payload.embeddingBuffer)
    self.postMessage({ type: 'result', id })
    return
  }

  if (type === 'decode') {
    if (!cachedEmbedding) {
      self.postMessage({ type: 'error', id, error: 'no embedding cached' })
      return
    }
    try {
      const { pointX, pointY, origW, origH } = payload

      const allFeeds = {
        image_embeddings: new ort.Tensor('float32', cachedEmbedding, [1, 256, 64, 64]),
        point_coords: new ort.Tensor('float32', new Float32Array([pointX, pointY, 0, 0]), [1, 2, 2]),
        point_labels: new ort.Tensor('float32', new Float32Array([1, -1]), [1, 2]),
        mask_input: new ort.Tensor('float32', new Float32Array(256 * 256).fill(0), [1, 1, 256, 256]),
        has_mask_input: new ort.Tensor('float32', new Float32Array([0]), [1]),
        orig_im_size: new ort.Tensor('float32', new Float32Array([origH, origW]), [2]),
      }
      // Only pass inputs the model actually declares — EdgeSAM omits mask_input/has_mask_input
      const feeds = Object.fromEntries(
        session.inputNames.map(name => [name, allFeeds[name]])
      )

      const results = await session.run(feeds)
      // EdgeSAM outputs: outputNames[0]='scores', outputNames[1]='masks'
      const scores = results[session.outputNames[0]]
      const masks = results[session.outputNames[1]]

      const numMasks = masks.dims[1]
      let best = 0
      for (let i = 1; i < numMasks; i++) {
        if (scores.data[i] > scores.data[best]) best = i
      }

      const maskH = masks.dims[2]
      const maskW = masks.dims[3]
      const offset = best * maskH * maskW
      const result = new Uint8Array(origW * origH)

      for (let y = 0; y < origH; y++) {
        for (let x = 0; x < origW; x++) {
          const mx = Math.min(Math.floor((x / origW) * maskW), maskW - 1)
          const my = Math.min(Math.floor((y / origH) * maskH), maskH - 1)
          result[y * origW + x] = masks.data[offset + my * maskW + mx] > 0 ? 1 : 0
        }
      }

      self.postMessage({ type: 'result', id, mask: result.buffer }, [result.buffer])
    } catch (err) {
      self.postMessage({ type: 'error', id, error: err.message })
    }
  }
}
