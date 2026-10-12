/**
 * shortCut — Electron Accelerator → tinykeys 格式转换工具
 *
 * Electron Accelerator 格式: "CmdOrCtrl+Shift+P", "Alt+F4", "MediaPlayPause"
 * tinykeys 格式: "$mod+Shift+p", "Alt+F4", "MediaPlayPause"
 *
 * @see https://www.electronjs.org/docs/latest/api/accelerator
 * @see https://github.com/jamiebuilds/tinykeys
 */

/**
 * 修饰键映射表：Electron Accelerator → tinykeys modifier
 *
 * Electron 格式不区分大小写，这里统一按小写 key 匹配。
 * tinykeys 使用 KeyboardEvent.getModifierState() 的标准名称。
 */
const MODIFIER_MAP: Record<string, string> = {
    // Ctrl / Control
    ctrl: 'Control',
    control: 'Control',

    // Alt / Option
    alt: 'Alt',
    option: 'Alt',

    // Shift
    shift: 'Shift',

    // Meta / Command / Super
    meta: 'Meta',
    cmd: 'Meta',
    command: 'Meta',
    super: 'Meta',

    // 特殊：跨平台修饰键
    cmdorctrl: '$mod',
    commandorcontrol: '$mod',
};

/**
 * 特殊键名映射表：Electron 键名 → tinykeys 键名
 *
 * Electron 使用自己的命名（如 "Return"），
 * tinykeys 使用 KeyboardEvent.key 或 KeyboardEvent.code 标准名称。
 */
const KEY_MAP: Record<string, string> = {
    // 导航键
    return: 'Enter',
    enter: 'Enter',
    backspace: 'Backspace',
    delete: 'Delete',
    del: 'Delete',
    tab: 'Tab',
    escape: 'Escape',
    esc: 'Escape',
    space: 'Space',

    // 方向键
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',

    // 翻页
    pageup: 'PageUp',
    pagedown: 'PageDown',
    home: 'Home',
    end: 'End',

    // 功能键（保留原名，KeyboardEvent.key 使用相同格式）
    // F1-F24 不需要映射，直接保留

    // 媒体键
    mediaplaypause: 'MediaPlayPause',
    mediastop: 'MediaStop',
    medianexttrack: 'MediaTrackNext',
    mediaprevioustrack: 'MediaTrackPrevious',
    volumeup: 'AudioVolumeUp',
    volumedown: 'AudioVolumeDown',
    volumemute: 'AudioVolumeMute',

    // 符号键
    plus: '+',
    numadd: '+',
    numsub: '-',
    numdec: '.',
    nummult: '*',
    numdiv: '/',
};

/**
 * (上游#445)
 * DOM 键名 → Electron Accelerator 键名 的反查表。
 *
 * 录制时拿到的是 KeyboardEvent.key（`ArrowUp` / `' '`），而 Electron 的 globalShortcut
 * 只认它自己那张表（`Up` / `Space`）：解析不出 token 时 StringToAccelerator 返回 false，
 * register() 抛 Invalid accelerator。本地（tinykeys）用的正是 DOM 键名，
 * 于是同一份配置会表现为「本地能用、全局用不了」。
 *
 * 只列两边不一致的键；Backspace / Delete / PageUp / Home / Tab 等两边同名，无需映射。
 */
const DOM_KEY_TO_ELECTRON: Record<string, string> = {
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    ' ': 'Space',
};

/** 把单个 KeyboardEvent.key 归一成 Electron 认得的键名（先查映射表，单字符才转大写） */
export function domKeyToElectronKey(key: string): string {
    // 必须先查映射表：空格（' '）长度也是 1，否则会被当成普通单字符键原样存下
    const mapped = DOM_KEY_TO_ELECTRON[key];
    if (mapped) {
        return mapped;
    }
    return key.length === 1 ? key.toUpperCase() : key;
}

/**
 * 归一化一组按键部件：把历史配置里存下的 DOM 键名（ArrowUp / ' '）转成 Electron 键名。
 * 读取旧配置时用，避免用户之前录好的快捷键永远注册不上。
 */
export function toElectronAcceleratorParts(parts: string[]): string[] {
    return parts.map((part) => DOM_KEY_TO_ELECTRON[part] ?? part);
}

/**
 * 将 Electron Accelerator 格式的快捷键字符串转换为 tinykeys 格式。
 *
 * @param accelerator Electron Accelerator 格式字符串，如 "CmdOrCtrl+Shift+P"
 * @returns tinykeys 格式字符串，如 "$mod+Shift+p"
 *
 * @example
 * ```ts
 * electronAcceleratorToTinykeys("CmdOrCtrl+Shift+P")  // → "$mod+Shift+p"
 * electronAcceleratorToTinykeys("Alt+F4")             // → "Alt+F4"
 * electronAcceleratorToTinykeys("Ctrl+A")             // → "Control+a"
 * electronAcceleratorToTinykeys("MediaPlayPause")     // → "MediaPlayPause"
 * ```
 */
export function electronAcceleratorToTinykeys(accelerator: string): string {
    // 兼容旧配置：空格键可能存储为 ' ' 而非 'Space'，
    // split('+') + trim() 会丢失它。先统一替换为 'Space'。
    const sanitized = accelerator.replace(/ /g, 'Space');
    const parts = sanitized
        .split('+')
        .map((p) => p.trim())
        .filter(Boolean);

    const modifiers: string[] = [];
    let key = '';

    for (const part of parts) {
        const lower = part.toLowerCase();
        const modifier = MODIFIER_MAP[lower];

        if (modifier) {
            modifiers.push(modifier);
        } else {
            // 非修饰键：尝试映射特殊键名，否则保持原值
            key = KEY_MAP[lower] ?? part;
        }
    }

    // 对于纯字母键（单个字符），tinykeys 匹配 event.key，需要小写
    // 对于特殊键（如 F4, ArrowUp），保持原样
    if (key.length === 1 && /^[A-Za-z]$/.test(key)) {
        key = key.toLowerCase();
    }

    // 拼接：modifiers + key
    const allParts = [...modifiers, key].filter(Boolean);
    return allParts.join('+');
}

/**
 * 将 KeyboardEvent 转换为 Electron Accelerator 按键部分数组。
 *
 * @returns 按键部分数组，如 `["CmdOrCtrl", "Shift", "P"]`
 *
 * @example
 * ```ts
 * // 用户按下 Ctrl+Shift+P
 * keyboardEventToElectronAccelerator(event)  // → ["CmdOrCtrl", "Shift", "P"]
 * ```
 */
export function keyboardEventToElectronAccelerator(e: KeyboardEvent): string[] {
    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push('CmdOrCtrl');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');

    // 排除单独的修饰键
    if (!['Control', 'Meta', 'Shift', 'Alt'].includes(e.key)) {
        parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
    }

    return parts;
}
