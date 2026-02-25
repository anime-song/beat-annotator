import { useRef, useState, useEffect, useCallback } from 'react';
import { Play, Pause, ZoomIn, ZoomOut, Upload, Settings, Save, Download, Undo2, Redo2, Activity, History } from 'lucide-react';
import { useStore } from 'zustand';
import { useScoreStore, verifyPermission } from '../store';
import './Toolbar.css';

export function Toolbar() {
    const isPlaying = useScoreStore((state) => state.isPlaying);
    const setPlaying = useScoreStore((state) => state.setPlaying);
    const zoomLevel = useScoreStore((state) => state.zoomLevel);
    const setZoom = useScoreStore((state) => state.setZoom);
    const offsetMs = useScoreStore((state) => state.offsetMs);
    const setOffsetMs = useScoreStore((state) => state.setOffsetMs);
    const isMetronomeEnabled = useScoreStore((state) => state.isMetronomeEnabled);
    const setMetronomeEnabled = useScoreStore((state) => state.setMetronomeEnabled);
    const metronomeVolume = useScoreStore((state) => state.metronomeVolume);
    const setMetronomeVolume = useScoreStore((state) => state.setMetronomeVolume);
    const addMeasures = useScoreStore((state) => state.addMeasures);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const projectInputRef = useRef<HTMLInputElement>(null);
    const [isMetronomePanelOpen, setIsMetronomePanelOpen] = useState(false);
    const [addCount, setAddCount] = useState<number>(10);
    const metronomePanelRef = useRef<HTMLDivElement>(null);

    // クリック範囲外でパネルを閉じる
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (metronomePanelRef.current && !metronomePanelRef.current.contains(event.target as Node)) {
                setIsMetronomePanelOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Undo / Redo の状態
    const { undo, redo, pastStates, futureStates } = useStore(useScoreStore.temporal);

    const handleZoomIn = () => setZoom(Math.min(zoomLevel + 20, 300));
    const handleZoomOut = () => setZoom(Math.max(zoomLevel - 20, 20));

    const processAudioFile = async (file: File) => {
        const event = new CustomEvent('audio-upload', { detail: { file } });
        window.dispatchEvent(event);
        
        let isProjectLoaded = false;
        
        // 自動読み込み: 同名のビートファイルを探す
        const state = useScoreStore.getState();
        if (state.beatFolderHandle) {
            try {
                const hasPermission = await verifyPermission(state.beatFolderHandle, false);
                if (hasPermission) {
                    const baseName = file.name.replace(/\.[^/.]+$/, "");
                    const beatFileName = `${baseName}.beat`;
                    try {
                        const beatFileHandle = await state.beatFolderHandle.getFileHandle(beatFileName);
                        const beatFile = await beatFileHandle.getFile();
                        
                        const text = await beatFile.text();
                        const data = JSON.parse(text);
                        
                        useScoreStore.setState({
                            audioFileName: data.audioFileName || file.name,
                            offsetMs: data.offsetMs || 0,
                            measures: data.measures || [],
                            warpMarkers: data.warpMarkers || [],
                            fileHandle: beatFileHandle
                        });
                        useScoreStore.getState().showToast(`関連プロジェクト ${beatFileName} を自動読み込みしました`, 'success');
                        isProjectLoaded = true;
                    } catch (err) {
                        // ファイルが存在しない場合は無視
                        console.log("No matching beat file found or error reading it:", err);
                    }
                }
            } catch (err) {
                console.error("Error accessing beat folder for auto-load:", err);
            }
        }

        // 同名プロジェクトが読み込まれなかった場合、現在のスコア状態を完全にリセットする
        if (!isProjectLoaded) {
            useScoreStore.setState({
                audioFileName: file.name,
                offsetMs: 0,
                warpMarkers: [],
                fileHandle: null,
                measures: Array.from({ length: 20 }).map((_, i) => ({
                    id: `m_${i}_${Date.now()}`,
                    index: i,
                    timeSignature: { num: 4, den: 4 },
                    ...(i === 0 ? { tempo: { baseNote: 'quarter', bpm: 120 } } : {}),
                })),
            });
            useScoreStore.getState().showToast('新しいオーディオに合わせてスコアを初期化しました', 'info');
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            await processAudioFile(e.target.files[0]);
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleOpenAudioClick = async () => {
        if ('showOpenFilePicker' in window) {
            try {
                const state = useScoreStore.getState();
                let startIn: FileSystemDirectoryHandle | 'music' = 'music';
                if (state.audioFolderHandle) {
                    const hasPermission = await verifyPermission(state.audioFolderHandle, false);
                    if (hasPermission) startIn = state.audioFolderHandle;
                }
                const [fileHandle] = await (window as any).showOpenFilePicker({
                    types: [{
                        description: 'Audio Files',
                        accept: { 'audio/*': ['.wav', '.mp3', '.m4a', '.flac', '.ogg'] }
                    }],
                    startIn,
                    multiple: false
                });
                const file = await fileHandle.getFile();
                await processAudioFile(file);
            } catch (err: any) {
                if (err.name !== 'AbortError') {
                    console.error("オーディオの選択に失敗しました", err);
                    fileInputRef.current?.click();
                }
            }
        } else {
            fileInputRef.current?.click();
        }
    };

    const fallbackSave = useCallback((blob: Blob, downloadName: string) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = downloadName;
        a.click();
        URL.revokeObjectURL(url);
    }, []);

    const handleSaveProject = useCallback(async () => {
        const state = useScoreStore.getState();
        const data = {
            audioFileName: state.audioFileName,
            offsetMs: state.offsetMs,
            measures: state.measures,
            warpMarkers: state.warpMarkers,
        };
        // 文字化け（フェルマータ等の絵文字/特殊文字）を防ぐため、明示的にUTF-8のUint8Arrayにエンコードして保存する
        const jsonString = JSON.stringify(data, null, 2);
        const utf8Encoder = new TextEncoder();
        const utf8Array = utf8Encoder.encode(jsonString);
        const blob = new Blob([utf8Array], { type: 'application/json;charset=utf-8' });
        
        let downloadName = 'project.beat';
        if (state.audioFileName) {
            const baseName = state.audioFileName.replace(/\.[^/.]+$/, "");
            downloadName = `${baseName}.beat`;
        }

        if ('showSaveFilePicker' in window) {
            try {
                let handle = state.fileHandle;
                if (!handle) {
                    let startIn: FileSystemDirectoryHandle | 'documents' = 'documents';
                    if (state.beatFolderHandle) {
                        const hasPermission = await verifyPermission(state.beatFolderHandle, false);
                        if (hasPermission) startIn = state.beatFolderHandle;
                    }

                    handle = await (window as any).showSaveFilePicker({
                        suggestedName: downloadName,
                        startIn,
                        types: [{
                            description: 'Beat Annotator Project',
                            accept: { 'application/json': ['.beat', '.json'] },
                        }],
                    });
                    useScoreStore.getState().setFileHandle(handle);
                }
                
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
                console.log("ファイルを保存しました");
                useScoreStore.getState().showToast('プロジェクトを保存しました', 'success');
            } catch (err: any) {
                if (err.name !== 'AbortError') {
                    console.error("保存エラー:", err);
                    fallbackSave(blob, downloadName);
                    useScoreStore.getState().showToast('プロジェクトを保存しました', 'success');
                }
            }
        } else {
            fallbackSave(blob, downloadName);
            useScoreStore.getState().showToast('プロジェクトを保存しました', 'success');
        }
    }, [fallbackSave]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                handleSaveProject();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleSaveProject]);

    const processProjectFile = async (file: File) => {
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const data = JSON.parse(ev.target?.result as string);
                useScoreStore.setState({
                    audioFileName: data.audioFileName || null,
                    offsetMs: data.offsetMs || 0,
                    measures: data.measures || [],
                    warpMarkers: data.warpMarkers || []
                });
                useScoreStore.getState().showToast('プロジェクトを読み込みました', 'success');
                
                // 自動読み込み: 同名のオーディオファイルを探す
                const state = useScoreStore.getState();
                if (state.audioFolderHandle && data.audioFileName) {
                    try {
                        const hasPermission = await verifyPermission(state.audioFolderHandle, false);
                        if (hasPermission) {
                            try {
                                const audioFileHandle = await state.audioFolderHandle.getFileHandle(data.audioFileName);
                                const audioFile = await audioFileHandle.getFile();
                                
                                const event = new CustomEvent('audio-upload', { detail: { file: audioFile } });
                                window.dispatchEvent(event);
                                useScoreStore.getState().showToast(`関連音声 ${data.audioFileName} を自動読み込みしました`, 'success');
                            } catch (err) {
                                console.log("No matching audio file found or error reading it:", err);
                            }
                        }
                    } catch (err) {
                        console.error("Error accessing audio folder for auto-load:", err);
                    }
                } else if (state.audioFolderHandle) {
                    // dataにaudioFileNameがない場合、プロジェクトファイル名から推測する試み
                    const baseName = file.name.replace(/\.[^/.]+$/, "");
                    const possibleExts = ['.wav', '.mp3', '.m4a', '.flac', '.ogg'];
                    
                    try {
                        const hasPermission = await verifyPermission(state.audioFolderHandle, false);
                        if (hasPermission) {
                            for (const ext of possibleExts) {
                                try {
                                    const audioFileName = `${baseName}${ext}`;
                                    const audioFileHandle = await state.audioFolderHandle.getFileHandle(audioFileName);
                                    const audioFile = await audioFileHandle.getFile();
                                    
                                    const event = new CustomEvent('audio-upload', { detail: { file: audioFile } });
                                    window.dispatchEvent(event);
                                    useScoreStore.getState().showToast(`関連音声 ${audioFileName} を自動読み込みしました`, 'success');
                                    break; // 1つ見つかれば終了
                                } catch (e) {
                                    // 拡張子が違う場合は無視して次へ
                                }
                            }
                        }
                    } catch (err) {
                        console.error("Error accessing audio folder for auto-load:", err);
                    }
                }
            } catch (err) {
                console.error("プロジェクトファイルのパースに失敗しました", err);
                useScoreStore.getState().showToast('プロジェクトの読み込みに失敗しました', 'error');
            }
        };
        reader.readAsText(file);
    };

    const handleLoadProject = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            await processProjectFile(file);
        }
        if (projectInputRef.current) projectInputRef.current.value = '';
    };

    const handleLoadProjectClick = async () => {
        if ('showOpenFilePicker' in window) {
            try {
                const state = useScoreStore.getState();
                let startIn: FileSystemDirectoryHandle | 'documents' = 'documents';
                if (state.beatFolderHandle) {
                    const hasPermission = await verifyPermission(state.beatFolderHandle, false);
                    if (hasPermission) startIn = state.beatFolderHandle;
                }
                const [fileHandle] = await (window as any).showOpenFilePicker({
                    types: [{
                        description: 'Beat Annotator Project',
                        accept: { 'application/json': ['.beat', '.json'] }
                    }],
                    startIn,
                    multiple: false
                });
                const file = await fileHandle.getFile();
                await processProjectFile(file);
            } catch (err: any) {
                if (err.name !== 'AbortError') {
                    console.error("プロジェクトの選択に失敗しました", err);
                    projectInputRef.current?.click();
                }
            }
        } else {
            projectInputRef.current?.click();
        }
    };

    return (
        <div className="toolbar">
            <div className="toolbar-section">
                <div className="logo-container">
                    <span className="logo-text">Beat Annotator</span>
                </div>
                <div className="divider"></div>

                {/* ファイルグループ */}
                <input
                    type="file"
                    accept="audio/*"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    onChange={handleFileUpload}
                />
                <button className="icon-btn text-btn" title="音声を開く" onClick={handleOpenAudioClick}>
                    <Upload size={16} style={{ marginRight: '6px' }} /> 開く
                </button>
                <button className="icon-btn text-btn" title="プロジェクトを保存" onClick={handleSaveProject}>
                    <Save size={16} style={{ marginRight: '6px' }} /> 保存
                </button>
                <input
                    type="file"
                    accept=".beat,.json"
                    ref={projectInputRef}
                    style={{ display: 'none' }}
                    onChange={handleLoadProject}
                />
                <button className="icon-btn text-btn" title="プロジェクトを読み込む" onClick={handleLoadProjectClick}>
                    <Download size={16} style={{ marginRight: '6px' }} /> 読込
                </button>

                <div className="divider"></div>

                {/* 編集グループ */}
                <button
                    className="icon-btn text-btn"
                    title="元に戻す (Ctrl+Z)"
                    onClick={() => {
                        const before = useScoreStore.getState();
                        undo();
                        if (before.lastAction) {
                            useScoreStore.getState().showToast(`元に戻しました: ${before.lastAction}`, 'info');
                        }
                    }}
                    disabled={pastStates.length === 0}
                    style={{ opacity: pastStates.length === 0 ? 0.3 : 1 }}
                >
                    <Undo2 size={16} style={{ marginRight: '4px' }} /> 戻す
                </button>
                <button
                    className="icon-btn text-btn"
                    title="やり直す (Ctrl+Y)"
                    onClick={() => {
                        redo();
                        setTimeout(() => {
                            const after = useScoreStore.getState();
                            if (after.lastAction) after.showToast(`やり直しました: ${after.lastAction}`, 'info');
                        }, 0);
                    }}
                    disabled={futureStates.length === 0}
                    style={{ opacity: futureStates.length === 0 ? 0.3 : 1 }}
                >
                    <Redo2 size={16} style={{ marginRight: '4px' }} /> やり直す
                </button>
                <button
                    className="icon-btn text-btn"
                    title="操作履歴を表示"
                    onClick={() => useScoreStore.getState().setHistoryViewerOpen(true)}
                >
                    <History size={16} style={{ marginRight: '4px' }} /> 履歴
                </button>
            </div>

            <div className="toolbar-section player-controls">
                <div className="offset-control" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '16px' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>オフセット:</span>
                    <input 
                        type="number" 
                        value={offsetMs}
                        onChange={(e) => {
                            const val = parseInt(e.target.value);
                            if (!isNaN(val)) {
                                setOffsetMs(val);
                            }
                        }}
                        style={{
                            width: '60px',
                            background: 'var(--bg-layer-1)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)',
                            padding: '4px',
                            borderRadius: '4px',
                            fontSize: '0.8rem'
                        }}
                    />
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ms</span>
                </div>
                <div className="divider" style={{ marginRight: '16px' }}></div>
                
                <button
                    className={`icon-btn play-btn ${isPlaying ? 'active' : ''}`}
                    onClick={() => setPlaying(!isPlaying)}
                    title={isPlaying ? "一時停止" : "再生 (Space)"}
                >
                    {isPlaying ? <Pause size={24} /> : <Play size={24} />}
                </button>
                <div className="divider"></div>
                <div className="metronome-wrapper" ref={metronomePanelRef}>
                    <button
                        className={`icon-btn text-btn ${isMetronomeEnabled ? 'active' : ''}`}
                        onClick={() => setIsMetronomePanelOpen(!isMetronomePanelOpen)}
                        title="メトロノーム設定 (M)"
                        style={isMetronomeEnabled ? { color: 'var(--accent-primary)', backgroundColor: 'var(--bg-surface-hover)' } : {}}
                    >
                        <Activity size={16} style={{ marginRight: '6px' }} /> 
                        メトロノーム
                        <div style={{ marginLeft: '4px', fontSize: '0.7rem' }}>▼</div>
                    </button>
                    
                    {isMetronomePanelOpen && (
                        <div className="metronome-dropdown">
                            <div className="dropdown-header">メトロノーム設定</div>
                            <div className="dropdown-row">
                                <span>有効化 (M)</span>
                                <label className="toggle-switch">
                                    <input 
                                        type="checkbox" 
                                        checked={isMetronomeEnabled} 
                                        onChange={(e) => setMetronomeEnabled(e.target.checked)} 
                                    />
                                    <span className="toggle-slider"></span>
                                </label>
                            </div>
                            <div className="dropdown-row">
                                <span>音量</span>
                                <span className="volume-value">{Math.round(metronomeVolume * 100)}%</span>
                            </div>
                            <div className="dropdown-row volume-control-row">
                                <Activity size={14} className="volume-icon" />
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="1" 
                                    step="0.05" 
                                    value={metronomeVolume} 
                                    onChange={(e) => setMetronomeVolume(parseFloat(e.target.value))}
                                    className="volume-slider"
                                    style={{ backgroundSize: `${metronomeVolume * 100}% 100%` }}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="toolbar-section view-controls">
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginRight: '16px' }}>
                    <input
                        type="number"
                        min="1"
                        max="100"
                        value={addCount}
                        onChange={(e) => setAddCount(parseInt(e.target.value) || 1)}
                        style={{
                            width: '50px',
                            background: 'var(--bg-layer-1)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)',
                            padding: '4px',
                            borderRadius: '4px',
                            fontSize: '0.8rem',
                            textAlign: 'center'
                        }}
                    />
                    <button 
                        className="text-btn small" 
                        onClick={() => { if (addCount > 0) addMeasures(addCount); }}
                        style={{ whiteSpace: 'nowrap' }}
                    >
                        小節を追加
                    </button>
                </div>
                <div className="divider" style={{ marginRight: '16px' }}></div>
                <button className="icon-btn" onClick={handleZoomOut} title="縮小">
                    <ZoomOut size={20} />
                </button>
                <span className="zoom-text" title="現在のズーム レベル">{zoomLevel}%</span>
                <button className="icon-btn" onClick={handleZoomIn} title="拡大">
                    <ZoomIn size={20} />
                </button>
                <div className="divider"></div>
                <button className="icon-btn text-btn" title="プロジェクト設定" onClick={() => useScoreStore.getState().setSettingsOpen(true)}>
                    <Settings size={16} style={{ marginRight: '6px' }} /> 設定
                </button>
            </div>
        </div>
    );
}
