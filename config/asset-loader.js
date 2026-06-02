const path = require('path')

function toUnixPath(p) {
  return p.replace(/\\/g, '/')
}

module.exports = function assetLoader() {
  const srcDir = path.resolve(this.rootContext, 'src')
  const srcPath = path.relative(srcDir, this.resourcePath)
  return `module.exports = ${JSON.stringify(toUnixPath(srcPath))};`
}
