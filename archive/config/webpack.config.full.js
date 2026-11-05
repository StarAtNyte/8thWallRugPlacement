const path = require('path')
const os = require('os')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const CopyWebpackPlugin = require('copy-webpack-plugin')
const qrcode = require('qrcode-terminal')

const srcPath = path.resolve(__dirname, '..', 'src')
const distPath = path.resolve(__dirname, '..', 'dist')
const rootPath = path.resolve(__dirname, '..')

const getLocalIP = () => {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return 'localhost'
}

module.exports = {
  entry: path.join(srcPath, 'app.js'),
  output: {
    filename: 'bundle.js',
    chunkFilename: '[name].[contenthash].js',
    path: distPath,
    clean: true,
    publicPath: 'auto',
  },
  devServer: {
    static: distPath,
    server: 'https',
    host: '0.0.0.0',
    port: 8070,
    allowedHosts: 'all',
    onListening: (devServer) => {
      const port = devServer.server.address().port
      const ip = getLocalIP()
      const url = `https://${ip}:${port}`
      console.log('\n📱 Scan QR code to open on mobile:\n')
      qrcode.generate(url, {small: true})
      console.log(`\n   ${url}\n`)
    },
    setupMiddlewares: (middlewares, devServer) => {
      const chunks = []
      devServer.app.post('/dev-log', (req, res) => {
        req.on('data', chunk => chunks.push(chunk))
        req.on('end', () => {
          try {
            const { level, msg } = JSON.parse(Buffer.concat(chunks).toString())
            chunks.length = 0
            const prefix = level === 'error' ? '\x1b[31m[ERR]\x1b[0m' : level === 'warn' ? '\x1b[33m[WRN]\x1b[0m' : '\x1b[36m[LOG]\x1b[0m'
            console.log(`${prefix} ${msg}`)
          } catch { chunks.length = 0 }
          res.writeHead(204).end()
        })
      })
      console.log('\x1b[36m[DevLog]\x1b[0m endpoint ready at /dev-log')
      return middlewares
    },
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
          },
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.(png|jpe?g|gif|svg|glb|gltf)$/i,
        include: path.join(srcPath, 'assets'),
        use: [
          {
            loader: path.resolve(__dirname, 'asset-loader.js'),
          },
        ],
      },
      {
        test: /\.html$/,
        use: [
          {
            loader: 'html-loader',
            options: {
              sources: {
                list: [
                  {tag: 'img', attribute: 'src', type: 'src'},
                  {tag: 'a-asset-item', attribute: 'src', type: 'src'},
                ],
              },
            },
          },
        ],
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.join(srcPath, 'index.html'),
      filename: 'index.html',
      inject: false,
    }),
    new CopyWebpackPlugin({
      patterns: [
        {from: 'external/', to: 'external/', noErrorOnMissing: true},
        {from: 'src/assets/', to: 'assets/', noErrorOnMissing: true},
        {from: 'node_modules/onnxruntime-web/dist/ort-wasm*.{wasm,mjs}', to: 'external/wasm/[name][ext]', noErrorOnMissing: true},
      ],
    }),
  ],
}
