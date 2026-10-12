/**
 * Forge 插件：把 `externals`（主进程里以 require 形式外置的原生模块）
 * 及其依赖从 asar 忽略列表里排除，确保它们被真正打进应用。
 *
 * 背景
 * ----
 * 原实现使用第三方包 `@timfish/forge-externals-plugin`，该包最后一次发布是
 * 2023-05，之后停更。它用 `require.resolve(\`${external}/package.json\`)` 定位模块，
 * 而该写法受 Node 的 `exports` 约束：像 `sharp@0.35+` 这种只导出 `"."` 的包会直接抛
 *
 *     ERR_PACKAGE_PATH_NOT_EXPORTED:
 *     Package subpath './package.json' is not defined by "exports" ...
 *
 * 本文件按原实现移植，仅把「模块定位」改为按路径逐级查找，规避 exports 限制；
 * 其余判定（依赖遍历、ignore 规则）与原实现保持一致，避免改变打包结果。
 * 这样也不再需要 `pnpm patch`（它对已安装的依赖常常不重新链接而不生效）。
 */
import type { ForgeConfig } from '@electron-forge/shared-types';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { DepType, Walker } from 'flora-colossus';

export interface ForgeExternalsPluginOptions {
    /** 以 require 形式外置、需要保留在应用内的模块名。 */
    externals?: string[];
    /** 是否连带其生产依赖一起保留。 */
    includeDeps?: boolean;
}

/** Walker 未公开、但运行时存在的成员（原实现同样直接借用）。 */
interface WalkerInternals {
    modules: Array<{ name: string; nativeModuleType: number }>;
    walkDependenciesForModule(modulePath: string, depType: DepType): Promise<void>;
}

/**
 * 从 startDir 起逐级向上查找 `<dir>/node_modules/<pkgName>/package.json`，
 * 返回该包的目录。全程只用 fs，不经过 Node 的 exports 解析。
 */
function findPackageRoot(pkgName: string, startDir: string): string {
    let dir = resolve(startDir || process.cwd());
    for (;;) {
        const candidate = join(dir, 'node_modules', pkgName, 'package.json');
        if (existsSync(candidate)) {
            return dirname(candidate);
        }
        const parent = dirname(dir);
        if (parent === dir) {
            // 走到文件系统根仍未找到：抛出与原实现同样风格的错误。
            throw new Error(
                `Failed to locate module "${pkgName}" from "${startDir}" while resolving forge externals`,
            );
        }
        dir = parent;
    }
}

export class ForgeExternalsPlugin {
    /** 插件名，仅用于 Forge 的日志前缀。 */
    public readonly name = 'forge-externals';

    /** Forge 借此识别「已经是插件实例」，无需再按包名去 node_modules 解析。 */
    public readonly __isElectronForgePlugin = true;

    private readonly externals: string[];

    private readonly includeDeps: boolean;

    private dir: string = process.cwd();

    public constructor(options: ForgeExternalsPluginOptions = {}) {
        this.externals = options.externals ?? [];
        this.includeDeps = options.includeDeps ?? true;
    }

    /** Forge 在加载插件后会调用它，传入项目根目录。 */
    public init(dir: string): void {
        this.dir = dir;
    }

    public getHooks(): { resolveForgeConfig: (forgeConfig: ForgeConfig) => Promise<ForgeConfig> } {
        return { resolveForgeConfig: this.resolveForgeConfig };
    }

    private resolveForgeConfig = async (forgeConfig: ForgeConfig): Promise<ForgeConfig> => {
        const foundModules = new Set<string>(this.externals);

        if (this.includeDeps) {
            for (const external of this.externals) {
                const moduleRoot = findPackageRoot(external, this.dir);

                const walker = new Walker(moduleRoot);
                const internals = walker as unknown as WalkerInternals;
                internals.modules = [];
                await internals.walkDependenciesForModule(moduleRoot, DepType.PROD);

                for (const dep of internals.modules) {
                    // 原实现即写成 `dep.nativeModuleType === DepType.PROD`：两者恰好都为 0
                    // （NativeModuleType.NONE = 0，DepType.PROD = 0），
                    // 等价于「保留非原生的纯 JS 依赖」。这里保持原判定不变。
                    if (dep.nativeModuleType === DepType.PROD) {
                        foundModules.add(dep.name);
                    }
                }
            }
        }

        // packagerConfig.ignore 已由 webpack 插件设置好；这里在其基础上放行 externals。
        const existingIgnoreFn = forgeConfig.packagerConfig?.ignore;

        forgeConfig.packagerConfig.ignore = (file?: string) => {
            if (!file) {
                return false;
            }

            if (typeof existingIgnoreFn === 'function' && existingIgnoreFn(file) === false) {
                return false;
            }

            if (file === '/node_modules') {
                return false;
            }

            for (const moduleName of foundModules) {
                if (
                    file.startsWith(`/node_modules/${moduleName}`) ||
                    file.startsWith(`/node_modules/${moduleName.split('/')[0]}`)
                ) {
                    return false;
                }
            }

            return true;
        };

        return forgeConfig;
    };
}
