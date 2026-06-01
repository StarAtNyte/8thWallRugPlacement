export function fuseMasks(segMask, depthMap, width, height, floorDepthThreshold = 0.7) {
  const result = new Uint8Array(width * height)
  for (let i = 0; i < result.length; i++) {
    if (!segMask[i]) continue
    if (depthMap[i] > floorDepthThreshold) continue
    result[i] = 1
  }
  return erode(result, width, height, 2)
}

export function erode(mask, width, height, iterations = 2) {
  let src = new Uint8Array(mask)
  let dst = new Uint8Array(width * height)
  for (let iter = 0; iter < iterations; iter++) {
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x
        dst[i] = (src[i - 1] && src[i + 1] && src[i - width] && src[i + width]) ? 1 : 0
      }
    }
    for (let y = 0; y < height; y++) {
      dst[y * width] = 0
      dst[y * width + width - 1] = 0
    }
    for (let x = 0; x < width; x++) {
      dst[x] = 0
      dst[(height - 1) * width + x] = 0
    }
    ;[src, dst] = [dst, src]
  }
  return src
}
