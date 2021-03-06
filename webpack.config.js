const path = require('path');
const crypto = require('crypto');
const { config } = require('dotenv-safe');
const HTMLPlugin = require('html-webpack-plugin');
const CSSExtractPlugin = require('mini-css-extract-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const CSSMinimizePlugin = require('css-minimizer-webpack-plugin');
const ReactRefreshPlugin = require('@pmmmwh/react-refresh-webpack-plugin');
const DotenvPlugin = require('dotenv-webpack');

const dev = process.env.NODE_ENV !== 'production';

const TOTAL_PAGES = 4;

const env = config();

/**
 * @type{ import('webpack').Configuration }
 */
module.exports = {
  entry: path.join(__dirname, 'src/index.tsx'),
  cache: {
    type: 'filesystem',
    buildDependencies: {
      config: [__filename, path.join(__dirname, 'babel.config.js')],
    },
    version: JSON.stringify(env.parsed) + (process.env.CACHE_VERSION || ''),
  },
  module: {
    rules: [
      // https://github.com/webpack/webpack/issues/11467
      {
        test: /\.m?js$/,
        resolve: {
          fullySpecified: false,
        },
      },
      {
        test: /\.tsx?$/,
        use: {
          loader: 'babel-loader',
        },
      },
      {
        test: /\.css$/,
        use: [CSSExtractPlugin.loader, 'css-loader'],
      },
    ],
  },
  output: {
    filename: '[name].[contenthash].js',
  },
  resolve: {
    extensions: ['.js', '.ts', '.tsx'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      classnames: 'clsx',
    },
  },
  plugins: [
    ...(dev ? [new ReactRefreshPlugin({ overlay: true })] : []),
    new DotenvPlugin({ safe: true, systemvars: true }),
    new CSSExtractPlugin({
      filename: '[name].[contenthash].css',
    }),
    new HTMLPlugin({
      template: path.join(__dirname, 'src/index.html'),
      scriptLoading: 'defer',
    }),
  ],
  optimization: {
    minimizer: [new TerserPlugin(), new CSSMinimizePlugin()],
    // Granular Chunks
    // from https://glitch.com/edit/#!/webpack-granular-split-chunks?path=webpack.config.js
    splitChunks: {
      chunks: 'all',
      maxInitialRequests: 30,
      maxAsyncRequests: 30,
      minSize: 20000,
      cacheGroups: {
        default: false,
        defaultVendors: false,
        framework: {
          name: 'framework',
          chunks: 'all',
          // React
          test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
          priority: 40,
          enforce: true,
        },
        lib: {
          test(module) {
            // 160KB cut off
            return module.size() > 160000 && /node_modules[\\/]/.test(module.identifier);
          },
          name(module) {
            const hash = crypto.createHash('sha1');
            hash.update(module.libIdent({ context: 'dir' }));
            return 'lib-' + hash.digest('hex').substring(0, 8);
          },
          priority: 30,
          minChunks: 1,
          reuseExistingChunk: true,
        },
        commons: {
          name: 'commons',
          chunks: 'all',
          minChunks: TOTAL_PAGES,
          priority: 20,
        },
        shared: {
          name(_module, chunks) {
            const hash = crypto
              .createHash('sha1')
              .update(chunks.reduce((acc, chunk) => acc + chunk.name, ''))
              .digest('hex');
            return hash;
          },
          priority: 10,
          minChunks: 2,
          reuseExistingChunk: true,
        },
      },
    },
  },
  devServer: {
    historyApiFallback: true,
  },
};
