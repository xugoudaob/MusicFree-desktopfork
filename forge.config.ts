import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerWix } from '@electron-forge/maker-wix';
import { MakerZIP } from '@electron-forge/maker-zip';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { WebpackPlugin } from '@electron-forge/plugin-webpack';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import path from 'path';

import { mainConfig } from './config/webpack.main.config';
import { rendererConfig } from './config/webpack.renderer.config';
import { preloadConfig } from './config/webpack.preload.config';

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
    rebuildConfig: {},
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
        {
            name: '@timfish/forge-externals-plugin',
            config: {
                externals: ['sharp', 'better-sqlite3'],
                includeDeps: true,
            },
        },
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
};

export default config;
