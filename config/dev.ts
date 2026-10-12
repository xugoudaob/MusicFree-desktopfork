/**
 * 跨平台 dev 启动器：先识别系统，再调用 `electron-forge start`。
 *
 * 为什么需要它
 * ------------
 * 原 `dev` 脚本写死为：
 *
 *     chcp 65001 && electron-forge start --inspect-electron
 *
 * `chcp` 是 Windows 控制台命令（把代码页切成 UTF-8，避免中文日志乱码），
 * macOS / Linux 上并不存在；npm / pnpm 一旦用 `sh` 执行脚本，就会在第一步
 * 直接中断，forge 根本起不来：
 *
 *     sh: 1: chcp: not found
 *
 * 另外 `node_modules/.bin/*` 只是符号链接，其指向的 .js 未必带可执行位，
 * 直接 spawn 会拿到 EACCES。这里改为「定位 forge 的 JS 入口、交给当前 node
 * 执行」，既不依赖可执行位，也避开 Windows 下 .cmd 的 spawn 限制。
 *
 * 运行方式
 * --------
 * 由 jiti 直接执行本 TS 文件（Forge 8 自身也用 jiti 加载 forge.config.ts）：
 *
 *     jiti config/dev.ts
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** 项目根目录（本文件位于 <root>/config）。 */
const projectRoot = resolve(__dirname, '..');

/** Windows 上 process.platform 恒为 'win32'。 */
const isWindows = process.platform === 'win32';

/** 从 startDir 起逐级向上查找 <dir>/node_modules/<pkg>/package.json 所在目录。 */
function findPackageDir(pkgName: string, startDir: string): string | null {
    let dir = resolve(startDir);
    for (;;) {
        const candidate = join(dir, 'node_modules', pkgName, 'package.json');
        if (existsSync(candidate)) {
            return dirname(candidate);
        }
        const parent = dirname(dir);
        if (parent === dir) {
            return null;
        }
        dir = parent;
    }
}

/**
 * 定位 electron-forge 的可执行入口。
 * 优先读包自身 package.json 的 bin 字段（用 fs 读取，绕开 exports 限制），
 * 退而使用 .bin 符号链接的真实路径；都拿不到则返回 null。
 */
function resolveForgeEntry(): string | null {
    const pkgDir = findPackageDir('@electron-forge/cli', projectRoot);
    if (pkgDir) {
        try {
            const pj = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) as {
                bin?: string | Record<string, string>;
            };
            const bin = typeof pj.bin === 'string' ? pj.bin : pj.bin?.['electron-forge'];
            if (bin) {
                const entry = join(pkgDir, bin);
                if (existsSync(entry)) {
                    return entry;
                }
            }
        } catch {
            // 解析失败则落到下面的兜底逻辑
        }
    }
    try {
        return realpathSync(join(projectRoot, 'node_modules', '.bin', 'electron-forge'));
    } catch {
        return null;
    }
}

if (isWindows) {
    // 只切代码页；chcp 不可用也不阻断启动。
    try {
        spawnSync('chcp 65001', { stdio: 'inherit', shell: true });
    } catch {
        // 忽略：代码页切换失败不该挡住开发流程
    }
} else {
    console.log(`[dev] 平台 ${process.platform}，跳过 chcp（Windows 专有命令）`);
}

const args = ['start', '--inspect-electron', ...process.argv.slice(2)];
const entry = resolveForgeEntry();

// 拿到 .js/.mjs 入口就用当前 node 执行（不依赖可执行位）；
// 否则退回 PATH 查找：Windows 下经 cmd.exe，兼容 Node 20+ 对 .cmd 的限制。
const isJsEntry = entry !== null && /\.(c?js|mjs)$/i.test(entry);
const command = isJsEntry
    ? process.execPath
    : isWindows
      ? process.env.ComSpec || 'cmd.exe'
      : 'electron-forge';
const commandArgs = isJsEntry
    ? [entry as string, ...args]
    : isWindows
      ? ['/d', '/s', '/c', 'electron-forge', ...args]
      : args;

const child = spawn(command, commandArgs, { stdio: 'inherit', env: process.env });

child.on('error', (err) => {
    console.error('[dev] 启动 electron-forge 失败:', err.message);
    console.error('[dev] 请确认已安装依赖：pnpm install');
    process.exit(1);
});

// 转发终止信号，避免留下孤立的 electron 进程。
const forwardedSignals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
for (const signal of forwardedSignals) {
    process.on(signal, () => {
        if (!child.killed) {
            child.kill(signal);
        }
    });
}

child.on('exit', (code, signal) => {
    process.exit(code ?? (signal ? 1 : 0));
});
