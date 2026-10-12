import type { Configuration } from 'webpack';
import path from 'path';

import { rules } from './webpack.rules';
import { plugins } from './webpack.plugins';

export const mainConfig: Configuration = {
    /**
     * This is the main entry point for your application, it's the first file
     * that runs in the main process.
     */
    entry: {
        index: './src/main/index.ts',
        requestForwarderWorker: './src/infra/requestForwarder/worker.ts',
    },
    output: {
        // Forge 8 的 webpack 插件把主进程 bundle 固定命名为 index.cjs
        // （见 WebpackConfig.js 中的 filename: 'index.cjs'），并要求 package.json
        // 的 main 指向 .webpack/main/index.cjs。
        // 这里用 [name].cjs 而非插件默认的固定名：本配置有 index 与
        // requestForwarderWorker 两个入口，固定名会让两者写同一个文件；
        // [name].cjs 分别产出 index.cjs 与 requestForwarderWorker.cjs，
        // 前者正是插件要求的入口名。
        filename: '[name].cjs',
    },
    // Put your normal webpack config below here
    module: {
        rules,
    },
    plugins,
    externals: ['sharp', 'better-sqlite3'],
    resolve: {
        extensions: ['.js', '.ts', '.jsx', '.tsx', '.css', '.json', '.node'],
        // music-metadata 等纯 ESM 包的 exports 只有 import 条件，
        // 而 electron-main + commonjs2 输出默认只匹配 require 条件，
        // 需要显式加入 import 才能正确解析这类包。
        conditionNames: ['node', 'import', 'require', 'default'],
        alias: {
            '@main': path.join(__dirname, '../src/main'),
            '@infra': path.join(__dirname, '../src/infra'),
            '@common': path.join(__dirname, '../src/common'),
            '@appTypes': path.join(__dirname, '../src/types'),
        },
    },
};
