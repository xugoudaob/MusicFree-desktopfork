import type { ForgeConfig } from '@electron-forge/shared-types';
import { execFileSync } from 'child_process';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerZIP } from '@electron-forge/maker-zip';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { WebpackPlugin } from '@electron-forge/plugin-webpack';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import path from 'path';

import { mainConfig } from './config/webpack.main.config';
import { rendererConfig } from './config/webpack.renderer.config';
import { preloadConfig } from './config/webpack.preload.config';
import { ForgeExternalsPlugin } from './config/forge-externals-plugin';

/** Windows 上 process.platform 恒为 'win32'。 */
const isWindows = process.platform === 'win32';

const config: ForgeConfig = {
    packagerConfig: {
        asar: {
            unpack: '**/node_modules/{sharp,@img}/**/*',
        },
        appBundleId: 'fun.upup.musicfree',
        icon: path.resolve(__dirname, 'res/logo'),
        executableName: 'MusicFree',
        extraResource: [path.resolve(__dirname, 'res')],
        win32metadata: {
            FileDescription: 'MusicFree',
            ProductName: 'MusicFree',
            CompanyName: 'maotoumao',
        },
        protocols: [
            {
                name: 'MusicFree',
                schemes: ['musicfree'],
            },
        ],
    },
    // better-sqlite3 自 13.0.0 起改为 N-API（预编译随包发布、跨 ABI 通用），
    // 但其包内布局（prebuilds/win32-x64.node）不符合 @electron/rebuild 的
    // prebuildify 识别条件，rebuild 会误判为普通原生模块并调用 node-gyp 源码编译；
    // Windows 上因此报 “node-gyp failed to rebuild better-sqlite3”。
    // onlyModules 是白名单，空数组 = 不做任何原生重编；
    // 本项目其余原生模块（sharp / @parcel/watcher / unrs-resolver 等）
    // 均为 N-API 平台分包预编译，皆无需重编。
    rebuildConfig: {
        onlyModules: [],
    },
    makers: [
        // Squirrel — 支持自动增量更新，安装目录固定为 %LOCALAPPDATA%\MusicFree
        // new MakerSquirrel({
        //     name: 'MusicFree',
        //     setupExe: 'MusicFreeDesktop-Setup.exe',
        // }),
        // // WiX Toolset — 支持自定义安装目录，但更新需要手动卸载重装
        // // 注意：需在 Windows 上安装 WiX Toolset：https://wixtoolset.org/
        // new MakerWix({
        //     name: 'MusicFree',
        //     appUserModelId: 'fun.upup.musicfree',
        //     manufacturer: 'maotoumao',
        //     description: '一个插件化的音乐播放器',
        //     language: 1033,
        //     ui: {
        //         chooseDirectory: true,
        //     },
        // }),
        // 便携版 zip — 解压即用，可以随便放哪
        new MakerZIP({}),
        new MakerDMG({
            format: 'ULFO',
        }),
        new MakerDeb({
            options: {
                bin: 'MusicFree',
                mimeType: ['x-scheme-handler/musicfree'],
            },
        }),
        new MakerRpm({
            options: {
                bin: 'MusicFree',
            },
        }),
    ],
    plugins: [
        new AutoUnpackNativesPlugin({}),
        new WebpackPlugin({
            devContentSecurityPolicy:
                "default-src * self blob: data: gap: file:; style-src * self 'unsafe-inline' blob: data: gap: file:; script-src * 'self' 'unsafe-eval' 'unsafe-inline' blob: data: gap: file:; object-src * 'self' blob: data: gap:; img-src * self 'unsafe-inline' blob: data: gap: file:; connect-src self * 'unsafe-inline' blob: data: gap:; frame-src * self blob: data: gap:;",
            mainConfig,
            renderer: {
                config: rendererConfig,
                entryPoints: [
                    {
                        html: './src/documents/index.html',
                        js: './src/renderer/mainWindow/index.tsx',
                        name: 'main_window',
                        preload: {
                            js: './src/preload/main.ts',
                            config: preloadConfig,
                        },
                    },
                    {
                        html: './src/documents/index.html',
                        js: './src/renderer/lyricWindow/index.tsx',
                        name: 'lyric_window',
                        preload: {
                            js: './src/preload/auxiliary.ts',
                            config: preloadConfig,
                        },
                    },
                    {
                        html: './src/documents/index.html',
                        js: './src/renderer/minimodeWindow/index.tsx',
                        name: 'minimode_window',
                        preload: {
                            js: './src/preload/auxiliary.ts',
                            config: preloadConfig,
                        },
                    },
                ],
            },
        }),
        // Externals plugin must be after WebpackPlugin so that
        // packagerConfig.ignore is already set as a function
        // 用本仓库内的实现替代已停更的 @timfish/forge-externals-plugin：
        // 原包通过 require.resolve(`<pkg>/package.json`) 定位模块，遇到只导出 "."
        // 的包（如 sharp 0.35+）会抛 ERR_PACKAGE_PATH_NOT_EXPORTED。
        new ForgeExternalsPlugin({
            externals: ['sharp', 'better-sqlite3'],
            includeDeps: true,
        }),
        // Fuses are used to enable/disable various Electron functionality
        // at package time, before code signing the application
        new FusesPlugin({
            version: FuseVersion.V1,
            [FuseV1Options.RunAsNode]: false,
            [FuseV1Options.EnableCookieEncryption]: true,
            [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
            [FuseV1Options.EnableNodeCliInspectArguments]: false,
            [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
            [FuseV1Options.OnlyLoadAppFromAsar]: false,
        }),
    ],
    hooks: {
        // Windows 上打完包后，用 Inno Setup 出安装包。
        // 走 release/build-windows.ps1（cmd 下是 build-windows.bat）：版本号由
        // 脚本从 package.json 读，再以 /DMyAppVersion= 传给 ISCC，避免落到
        // build-windows.iss 里 #ifndef 那个写死的兜底值——
        // 那正是「改了 package.json 却出旧版本号」的根因。
        // 非 Windows 平台直接跳过，不影响 deb/rpm/dmg。
        postMake: async (_forgeConfig, makeResults) => {
            if (!isWindows) {
                return makeResults;
            }
            execFileSync(
                'powershell',
                [
                    '-NoProfile',
                    '-ExecutionPolicy',
                    'Bypass',
                    '-File',
                    path.resolve(__dirname, 'release/build-windows.ps1'),
                ],
                { stdio: 'inherit' },
            );
            return makeResults;
        },
    },
};

export default config;
