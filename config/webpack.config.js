const path = require('path')
const os = require('os')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const CopyWebpackPlugin = require('copy-webpack-plugin')
const qrcode = require('qrcode-terminal')
const webpack = require('webpack')

const PORT = 8070

const srcPath = path.resolve(__dirname, '..', 'src')
const distPath = path.resolve(__dirname, '..', 'dist')
const rootPath = path.resolve(__dirname, '..')

const getLocalIP = () => {
  const interfaces = os.networkInterfaces()
  const candidates = []
  for (const name of Object.keys(interfaces)) {
    if (/^(docker|br-|veth|virbr|lo)/.test(name)) continue
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) candidates.push(iface.address)
    }
  }
  return candidates.find(ip => ip.startsWith('192.168.')) || candidates[0] || 'localhost'
}

module.exports = {
  entry: path.join(srcPath, 'app.js'),
  output: {
    filename: 'bundle.js',
    path: distPath,
    clean: true,
    publicPath: 'auto',
  },
  devServer: {
    static: distPath,
    server: 'https',
    host: '0.0.0.0',
    port: PORT,
    allowedHosts: 'all',
    onListening: (devServer) => {
      const port = devServer.server.address().port
      const ip = getLocalIP()
      const url = `https://${ip}:${port}`
      console.log('\n📱 Scan QR code to open on mobile:\n')
      qrcode.generate(url, {small: true})
      console.log(`\n   ${url}\n`)
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
        test: /\.html$/,
        use: [
          {
            loader: 'html-loader',
            // Keep asset paths as written; CopyWebpackPlugin serves src/assets/.
            options: {sources: false},
          },
        ],
      },
    ],
  },
  plugins: [
    new webpack.DefinePlugin({
      __LAN_URL__: JSON.stringify(`https://${getLocalIP()}:${PORT}`),
    }),
    new HtmlWebpackPlugin({
      template: path.join(srcPath, 'index.html'),
      filename: 'index.html',
      inject: false,
    }),
    new CopyWebpackPlugin({
      patterns: [
        {from: 'external/', to: 'external/', noErrorOnMissing: true},
        {from: 'src/assets/', to: 'assets/', noErrorOnMissing: true},
      ],
    }),
  ],
}
