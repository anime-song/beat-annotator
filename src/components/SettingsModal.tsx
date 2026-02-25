import { useScoreStore, verifyPermission } from '../store';
import { X, FolderOpen } from 'lucide-react';
import './SettingsModal.css';

export function SettingsModal() {
    const isSettingsOpen = useScoreStore(state => state.isSettingsOpen);
    const setSettingsOpen = useScoreStore(state => state.setSettingsOpen);
    
    const beatFolderHandle = useScoreStore(state => state.beatFolderHandle);
    const setBeatFolderHandle = useScoreStore(state => state.setBeatFolderHandle);
    
    const audioFolderHandle = useScoreStore(state => state.audioFolderHandle);
    const setAudioFolderHandle = useScoreStore(state => state.setAudioFolderHandle);

    if (!isSettingsOpen) return null;

    const handleSelectBeatFolder = async () => {
        try {
            const handle = await (window as any).showDirectoryPicker({
                mode: 'readwrite'
            });
            await verifyPermission(handle, true);
            setBeatFolderHandle(handle);
            useScoreStore.getState().showToast('ビート保存フォルダを設定しました', 'success');
        } catch (err: any) {
            if (err.name !== 'AbortError') {
                console.error("Failed to select beat folder:", err);
                useScoreStore.getState().showToast('フォルダの選択に失敗しました', 'error');
            }
        }
    };

    const handleSelectAudioFolder = async () => {
        try {
            const handle = await (window as any).showDirectoryPicker({
                mode: 'read'
            });
            await verifyPermission(handle, false);
            setAudioFolderHandle(handle);
            useScoreStore.getState().showToast('オーディオ保存フォルダを設定しました', 'success');
        } catch (err: any) {
            if (err.name !== 'AbortError') {
                console.error("Failed to select audio folder:", err);
                useScoreStore.getState().showToast('フォルダの選択に失敗しました', 'error');
            }
        }
    };

    return (
        <div className="settings-modal-overlay" onClick={() => setSettingsOpen(false)}>
            <div className="settings-modal-content" onClick={e => e.stopPropagation()}>
                <div className="settings-header">
                    <h2>プロジェクト設定</h2>
                    <button className="icon-btn" onClick={() => setSettingsOpen(false)}>
                        <X size={20} />
                    </button>
                </div>

                <div className="settings-body">
                    <p className="settings-description">
                        標準の保存先フォルダを設定しておくと、次にファイルを開いた際などに、同名のプロジェクトファイルや音声ファイルを自動的に見つけて読み込むことができるようになります。
                    </p>

                    <div className="settings-group">
                        <label className="settings-label">ビート保存フォルダ (プロジェクトファイル用)</label>
                        <div className="folder-selection">
                            <button className="text-btn outline" onClick={handleSelectBeatFolder} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <FolderOpen size={16} />
                                フォルダを選択
                            </button>
                            <span className="folder-name">
                                {beatFolderHandle ? beatFolderHandle.name : '未設定'}
                            </span>
                        </div>
                        <p className="settings-hint">※ .beat や .json ファイルの標準保存・読み込み先として使われます。</p>
                    </div>

                    <div className="settings-separator"></div>

                    <div className="settings-group">
                        <label className="settings-label">オーディオ保存フォルダ (音声ファイル用)</label>
                        <div className="folder-selection">
                            <button className="text-btn outline" onClick={handleSelectAudioFolder} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <FolderOpen size={16} />
                                フォルダを選択
                            </button>
                            <span className="folder-name">
                                {audioFolderHandle ? audioFolderHandle.name : '未設定'}
                            </span>
                        </div>
                        <p className="settings-hint">※ プロジェクトを開いた時に、ここから同名の音声ファイルを自動で探します。</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
