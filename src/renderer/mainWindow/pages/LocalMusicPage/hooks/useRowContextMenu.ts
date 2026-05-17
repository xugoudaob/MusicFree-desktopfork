import { createElement, useCallback, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { showContextMenu } from '../../../components/ui/ContextMenu/contextMenuManager';
import { showToast } from '../../../components/ui/Toast';
import { showModal } from '../../../components/ui/Modal/modalManager';
import type { RowInteractionDetail } from '../../../components/business/SongTable';
import localMusic from '@infra/localMusic/renderer';
import musicSheet from '@infra/musicSheet/renderer';
import trackPlayer from '@renderer/mainWindow/core/trackPlayer';
import { ListX } from 'lucide-react';

/**
 * Right-click handler that opens the standard MusicItemMenu,
 * plus a "Remove from local library" entry for local music items.
 */
export function useRowContextMenu() {
    const { t } = useTranslation();

    return useCallback(
        ({ selectedItems }: RowInteractionDetail, e: MouseEvent) => {
            const items = Array.isArray(selectedItems)
                ? (selectedItems as IMusic.IMusicItem[])
                : ([selectedItems] as IMusic.IMusicItem[]);

            showContextMenu(
                'MusicItemMenu',
                { x: e.clientX, y: e.clientY },
                {
                    musicItems: items,
                    extraEntries: [
                        {
                            id: 'remove-from-local-library',
                            icon: createElement(ListX, { size: 14 }),
                            label: t('local_music.remove_from_library'),
                            danger: true,
                            onClick: () => {
                                showModal('ConfirmModal', {
                                    title: t('local_music.confirm_remove_from_library_title'),
                                    message:
                                        items.length === 1
                                            ? t('local_music.confirm_remove_from_library_message')
                                            : t(
                                                  'local_music.confirm_remove_from_library_batch_message',
                                                  { count: items.length },
                                              ),
                                    confirmDanger: true,
                                    onConfirm: async () => {
                                        // 从 local_music DB 删除记录（不移文件）
                                        await localMusic.removeLibraryItems(items);
                                        // 从所有歌单和播放队列移除
                                        musicSheet.removeFromAllSheets(items);
                                        trackPlayer.removeMusic(items);
                                        showToast(t('local_music.removed_from_library'));
                                    },
                                });
                            },
                        },
                    ],
                },
            );
        },
        [t],
    );
}
