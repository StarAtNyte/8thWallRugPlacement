const path = require('path')

function toUnixPath(p) {
  return p.replace(/\\/g, '/')
}

module.exports = function assetLoader() {
  const srcPath = path.relative(this.rootContext, this.resourcePath)
  return `module.exports = ${JSON.stringify(toUnixPath(srcPath))};`
}
