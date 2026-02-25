import React, { useState, useEffect, useRef } from 'react';
import { useScoreStore } from '../store';
import './ScoreTimeline.css';

export function ScoreTimeline() {
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(window.innerWidth);

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setContainerWidth(entry.contentRect.width);
            }
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    const measures = useScoreStore((state) => state.measures);
    const zoomLevel = useScoreStore((state) => state.zoomLevel);
    const currentTimeMs = useScoreStore((state) => state.currentTimeMs);
    const setCurrentTime = useScoreStore((state) => state.setCurrentTime);
    const offsetMs = useScoreStore((state) => state.offsetMs);
    const setOffsetMs = useScoreStore((state) => state.setOffsetMs);

    const warpMarkers = useScoreStore((state) => state.warpMarkers);
    const addWarpMarker = useScoreStore((state) => state.addWarpMarker);
    const updateWarpMarker = useScoreStore((state) => state.updateWarpMarker);
    const selectedMeasureIndex = useScoreStore((state) => state.selectedMeasureIndex);
    const setSelectedMeasure = useScoreStore((state) => state.setSelectedMeasure);
    const setEditingMeasure = useScoreStore((state) => state.setEditingMeasure);
    const updateMeasure = useScoreStore((state) => state.updateMeasure);
    const updateTimeSignature = useScoreStore((state) => state.updateTimeSignature);
    const insertMeasure = useScoreStore((state) => state.insertMeasure);
    const removeMeasure = useScoreStore((state) => state.removeMeasure);
    const removeMeasuresAfter = useScoreStore((state) => state.removeMeasuresAfter);
    
    const recentTempos = useScoreStore((state) => state.recentTempos);
    const addRecentTempo = useScoreStore((state) => state.addRecentTempo);
    const recentTimeSignatures = useScoreStore((state) => state.recentTimeSignatures);
    const addRecentTimeSignature = useScoreStore((state) => state.addRecentTimeSignature);

    // レンダリング用の定数
    const ROW_HEIGHT = 160;
    const ROW_SPACING = 300; // 分離を良くするために距離を増加
    const HEADER_HEIGHT = 80;
    const LAYOUT_PADDING = 40;

    // ドラッグ状態
    const [dragInfo, setDragInfo] = useState<{ measureIndex: number; startX: number; startAudioMs: number; currentAudioMs: number } | null>(null);

    // コンテキストメニューの状態
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, measureIndex: number } | null>(null);
    const [contextMenuTempo, setContextMenuTempo] = useState<{ bpm: number | '', baseNote: string }>({ bpm: 120, baseNote: 'quarter' });
    const [contextMenuTimeSig, setContextMenuTimeSig] = useState<{ num: number | '', den: number | '' }>({ num: 4, den: 4 });

    // Zundo temporalストアからUndo / Redoを取得
    const { undo, redo } = useScoreStore.temporal.getState();

    // Undo / Redoと選択のグローバルホットキー
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Undo / Redo
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                if (e.shiftKey) {
                    e.preventDefault();
                    redo();
                    setTimeout(() => {
                        const after = useScoreStore.getState();
                        if (after.lastAction) after.showToast(`やり直しました: ${after.lastAction}`, 'info');
                    }, 0);
                } else {
                    e.preventDefault();
                    const before = useScoreStore.getState();
                    undo();
                    if (before.lastAction) {
                        useScoreStore.getState().showToast(`元に戻しました: ${before.lastAction}`, 'info');
                    }
                }
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                redo();
                setTimeout(() => {
                    const after = useScoreStore.getState();
                    if (after.lastAction) after.showToast(`やり直しました: ${after.lastAction}`, 'info');
                }, 0);
            }

            // キーボードナビゲーション
            if (e.key === 'ArrowLeft') {
                if (selectedMeasureIndex !== null) {
                    e.preventDefault();
                    setSelectedMeasure(Math.max(0, selectedMeasureIndex - 1));
                }
            } else if (e.key === 'ArrowRight') {
                if (selectedMeasureIndex !== null) {
                    e.preventDefault();
                    setSelectedMeasure(Math.min(measures.length - 1, selectedMeasureIndex + 1));
                } else if (measures.length > 0) {
                    e.preventDefault();
                    setSelectedMeasure(0);
                }
            } else if (e.key === 'Enter') {
                if (selectedMeasureIndex !== null) {
                    e.preventDefault();
                    setEditingMeasure(selectedMeasureIndex);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [undo, redo, selectedMeasureIndex, measures.length, setSelectedMeasure, setEditingMeasure]);

    // ラッピングを考慮して各小節のXおよびY位置を計算
    let currentBpm = 120; // デフォルトのフォールバック
    let currentBaseNote = 'quarter'; // デフォルトのフォールバック
    let lastAbsoluteBpm = 120; // 'a tempo'のために最後に明示的に設定されたテンポを保存

    let currentRow = 0;
    let currentX = LAYOUT_PADDING;
    let currentAudioMs = 0;

    const markerDict = Object.fromEntries(
        warpMarkers.filter(m => m.beatOffset === 0).map(m => [m.measureIndex, m])
    );

    // 表示用のオフセットとマーカー（ドラッグ中は上書き）
    let displayOffsetMs = offsetMs;
    const displayMarkerDict = { ...markerDict };

    if (dragInfo) {
        if (dragInfo.measureIndex === 0) {
            displayOffsetMs = dragInfo.currentAudioMs;
        } else {
            const existing = displayMarkerDict[dragInfo.measureIndex];
            if (existing) {
                displayMarkerDict[dragInfo.measureIndex] = { ...existing, audioTimeMs: dragInfo.currentAudioMs };
            } else {
                displayMarkerDict[dragInfo.measureIndex] = {
                    id: `warp_${dragInfo.measureIndex}_0_temp`,
                    measureIndex: dragInfo.measureIndex,
                    beatOffset: 0,
                    audioTimeMs: dragInfo.currentAudioMs
                };
            }
        }
    }

    if (displayOffsetMs > 0) {
        currentAudioMs = displayOffsetMs;
        const offsetPx = (displayOffsetMs / 1000) * zoomLevel;
        currentX += offsetPx;
        while (currentX > containerWidth - LAYOUT_PADDING) {
            currentX -= (containerWidth - LAYOUT_PADDING * 2);
            currentRow++;
        }
    }



    const measureLayouts = measures.map((measure, i) => {
        if (measure.tempo) {
            currentBpm = measure.tempo.bpm;
            currentBaseNote = measure.tempo.baseNote;
            lastAbsoluteBpm = measure.tempo.bpm;
        }

        // "a tempo"時のリセット処理
        if (measure.annotations?.includes('a tempo')) {
            currentBpm = lastAbsoluteBpm;
        }

        let nextBpm = currentBpm;
        let averageBpm = currentBpm;

        let measureDurationMs = 0;
        
        // 1つの基準音符(baseNote)あたりの長さ(ms)
        const msPerBaseNote = (60 / averageBpm) * 1000;
        
        // 基準音符を四分音符の長さに換算する係数
        let quarterNoteMultiplier = 1;
        if (currentBaseNote === 'eighth') {
            quarterNoteMultiplier = 0.5; // 八分音符は四分音符の半分の長さ
        } else if (currentBaseNote === 'dot-quarter') {
            quarterNoteMultiplier = 1.5; // 付点四分音符は1.5倍の長さ
        }

        // 1つの四分音符あたりの長さ(ms)
        const msPerQuarterNote = msPerBaseNote / quarterNoteMultiplier;

        // その小節が四分音符いくつ分か
        const quarterNotesInMeasure = measure.timeSignature.num * (4 / measure.timeSignature.den);
        
        const autoDuration = quarterNotesInMeasure * msPerQuarterNote;

        if (displayMarkerDict[i + 1]) {
            // もし「次」の小節にマーカーがある場合、そのポイントにピッタリ収まるようにこの小節を伸縮させる
            measureDurationMs = displayMarkerDict[i + 1].audioTimeMs - currentAudioMs;

            // 安全チェック：マーカーが無効または重なっている場合は自動計算にフォールバック
            if (measureDurationMs <= 0) {
                measureDurationMs = autoDuration;
            }
        } else {
            measureDurationMs = autoDuration;
            if (measure.fermataDurationMs) { measureDurationMs += measure.fermataDurationMs; }
        }

        const measurePxWidth = (measureDurationMs / 1000) * zoomLevel;

        // コンテナの幅を超える場合は次の行にラップする
        if (currentX + measurePxWidth > containerWidth - LAYOUT_PADDING && currentX > LAYOUT_PADDING) {
            currentRow++;
            currentX = LAYOUT_PADDING;
        }

        const layout = {
            row: currentRow,
            x: currentX,
            y: currentRow * ROW_SPACING,
            width: measurePxWidth,
            startMs: currentAudioMs,
            endMs: currentAudioMs + measureDurationMs,
            measure
        };

        currentX += measurePxWidth;
        currentAudioMs += measureDurationMs;
        currentBpm = nextBpm;

        return layout;
    });

    // 再生カーソルの位置を計算
    let cursorX = 0;
    let cursorY = 0;
    let cursorRow = 0;

    if (currentTimeMs < offsetMs) {
        cursorRow = 0;
        cursorX = LAYOUT_PADDING + ((currentTimeMs) / 1000) * zoomLevel; // 0がLAYOUT_PADDINGであると仮定
        cursorY = 0;
    } else {
        const hitLayout = measureLayouts.find(l => currentTimeMs >= l.startMs && currentTimeMs < l.endMs);
        if (hitLayout) {
            cursorRow = hitLayout.row;
            cursorX = hitLayout.x + ((currentTimeMs - hitLayout.startMs) / 1000) * zoomLevel;
            cursorY = hitLayout.y;
        } else if (measureLayouts.length > 0) {
            const last = measureLayouts[measureLayouts.length - 1];
            cursorRow = last.row;
            cursorX = last.x + last.width + ((currentTimeMs - last.endMs) / 1000) * zoomLevel;
            cursorY = last.y;

            // 画面を越えた場合、カーソルをラップする
            while (cursorX > containerWidth - LAYOUT_PADDING) {
                cursorX -= (containerWidth - LAYOUT_PADDING * 2);
                cursorRow++;
                cursorY = cursorRow * ROW_SPACING;
            }
        }
    }

    const handleMouseDown = (e: React.MouseEvent, measureIndex: number) => {
        e.preventDefault();
        const audioMs = measureIndex === 0 ? offsetMs : measureLayouts[measureIndex].startMs;
        setDragInfo({ measureIndex, startX: e.clientX, startAudioMs: audioMs, currentAudioMs: audioMs });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!dragInfo) return;
        const dx = e.clientX - dragInfo.startX;
        const dtMs = (dx / zoomLevel) * 1000;
        const newAudioMs = Math.max(0, dragInfo.startAudioMs + dtMs);

        setDragInfo(prev => prev ? { ...prev, currentAudioMs: newAudioMs } : null);
    };

    const handleMouseUp = () => {
        if (dragInfo) {
            // ここで決定してグローバルストアに反映する
            if (dragInfo.measureIndex === 0) {
                setOffsetMs(dragInfo.currentAudioMs);
                useScoreStore.setState({ lastAction: 'オフセットを変更' });
            } else {
                const existing = markerDict[dragInfo.measureIndex];
                if (existing) {
                    updateWarpMarker(existing.id, dragInfo.currentAudioMs);
                } else {
                    addWarpMarker({
                        id: `warp_${dragInfo.measureIndex}_0_${Date.now()}`, // 一意なIDのためにDate.now()を追加
                        measureIndex: dragInfo.measureIndex,
                        beatOffset: 0,
                        audioTimeMs: dragInfo.currentAudioMs
                    });
                }
            }
            setDragInfo(null);
        }
    };

    const handleContextMenu = (e: React.MouseEvent, measureIndex: number) => {
        e.preventDefault();
        const measure = measures[measureIndex];

        const initialBpm = measure.tempo?.bpm || 120;
        const initialBaseNote = measure.tempo?.baseNote || 'quarter';
        const initialNum = measure.timeSignature.num;
        const initialDen = measure.timeSignature.den;

        setContextMenuTempo({ bpm: initialBpm, baseNote: initialBaseNote });
        setContextMenuTimeSig({ num: initialNum, den: initialDen });
        
        // とりあえずクリック位置を初期値としてセット
        setContextMenu({ x: e.clientX, y: e.clientY, measureIndex });
    };

    const closeContextMenu = () => {
        setContextMenu(null);
    };

    // コンテキストメニュー自体のDOMへの参照
    const contextMenuRef = useRef<HTMLDivElement>(null);

    // メニューが開かれた後、自身の実際の高さ・幅から画面外にはみ出ていないか確認し、補正する
    useEffect(() => {
        if (contextMenu && contextMenuRef.current) {
            const rect = contextMenuRef.current.getBoundingClientRect();
            let newX = contextMenu.x;
            let newY = contextMenu.y;
            let changed = false;

            if (rect.right > window.innerWidth) {
                newX = Math.max(10, window.innerWidth - rect.width - 10);
                changed = true;
            }
            if (rect.bottom > window.innerHeight) {
                newY = Math.max(10, window.innerHeight - rect.height - 10);
                changed = true;
            }

            if (changed) {
                setContextMenu(prev => prev ? { ...prev, x: newX, y: newY } : null);
            }
        }
    }, [contextMenu?.measureIndex]); // measureIndexが変わったり新たに開かれた時に1度だけ計算する

    // メニュー外側での mousedown でメニューを閉じるようにする
    useEffect(() => {
        const handleGlobalMouseDown = (e: MouseEvent) => {
            if (contextMenu && contextMenuRef.current) {
                // コンテキストメニュー自体のクリックは無視する
                if (!contextMenuRef.current.contains(e.target as Node)) {
                    closeContextMenu();
                }
            }
        };

        if (contextMenu) {
            document.addEventListener('mousedown', handleGlobalMouseDown);
        }

        return () => {
            document.removeEventListener('mousedown', handleGlobalMouseDown);
        };
    }, [contextMenu]);

    const updateMeasureAnnotations = (measureIndex: number, text: string, toggle: boolean = false) => {
        const measure = measures[measureIndex];
        let currentAnnos = measure.annotations || [];

        if (toggle) {
            if (currentAnnos.includes(text)) {
                currentAnnos = currentAnnos.filter(a => a !== text);
            } else {
                currentAnnos = [...currentAnnos, text];
            }
        } else {
            if (!currentAnnos.includes(text)) {
                currentAnnos = [...currentAnnos, text];
            }
        }

        updateMeasure(measureIndex, {
            annotations: currentAnnos.length > 0 ? currentAnnos : undefined
        });
        closeContextMenu();
    };

    const updateMeasureSection = (measureIndex: number, section: string) => {
        const measure = measures[measureIndex];
        updateMeasure(measureIndex, { section: measure.section === section ? undefined : section });
        closeContextMenu();
    };

    const applyContextMenuTempo = () => {
        if (!contextMenu) return;
        const fallbackBpm = typeof contextMenuTempo.bpm === 'number' ? contextMenuTempo.bpm : parseInt(contextMenuTempo.bpm, 10) || 120;
        const tempoObj = {
            bpm: fallbackBpm,
            baseNote: contextMenuTempo.baseNote as 'quarter' | 'eighth' | 'dot-quarter'
        };
        updateMeasure(contextMenu.measureIndex, {
            tempo: tempoObj
        });
        addRecentTempo(tempoObj);
        closeContextMenu();
    };

    const applyContextMenuTimeSig = () => {
        if (!contextMenu) return;
        const numVal = typeof contextMenuTimeSig.num === 'number' ? contextMenuTimeSig.num : parseInt(contextMenuTimeSig.num, 10) || 4;
        const denVal = typeof contextMenuTimeSig.den === 'number' ? contextMenuTimeSig.den : parseInt(contextMenuTimeSig.den, 10) || 4;
        const tsObj = { num: numVal, den: denVal };
        updateTimeSignature(contextMenu.measureIndex, tsObj);
        addRecentTimeSignature(tsObj);
        closeContextMenu();
    };

    const clearContextMenuTimeSig = () => {
        if (!contextMenu || contextMenu.measureIndex === 0) return;
        const prevSig = measures[contextMenu.measureIndex - 1].timeSignature;
        updateTimeSignature(contextMenu.measureIndex, prevSig);
        closeContextMenu();
    };

    const clearContextMenuTempo = () => {
        if (!contextMenu || contextMenu.measureIndex === 0) return;
        updateMeasure(contextMenu.measureIndex, { tempo: undefined });
        closeContextMenu();
    };

    const maxRow = measureLayouts.length > 0 ? measureLayouts[measureLayouts.length - 1].row : 0;
    const actualMaxRow = Math.max(maxRow, cursorRow);
    const totalHeight = (actualMaxRow + 1) * ROW_SPACING + HEADER_HEIGHT + 100;
    const staffRows = Array.from({ length: actualMaxRow + 1 }, (_, i) => i);

    return (
        <div
            className="score-timeline-container"
            ref={containerRef}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onClick={() => {
                setSelectedMeasure(null);
            }}
        >
            <svg
                className="score-svg"
                width="100%"
                height={Math.max(totalHeight, window.innerHeight)}
            >
                <g transform={`translate(0, ${HEADER_HEIGHT})`}>
                    {/* 各行のメインタイムライン五線譜 */}
                    {staffRows.map(row => (
                        <line
                            key={`staff-${row}`}
                            x1={LAYOUT_PADDING}
                            y1={row * ROW_SPACING + ROW_HEIGHT / 2}
                            x2={Math.max(LAYOUT_PADDING, containerWidth - LAYOUT_PADDING)}
                            y2={row * ROW_SPACING + ROW_HEIGHT / 2}
                            className="staff-line"
                        />
                    ))}

                    {measureLayouts.map(({ x, y, width, startMs, measure }, i) => {
                        // 最初の小節はグローバルオフセットアンカーとして機能し、常にワープマーカーのように見えるべき
                        const hasMarker = i === 0 || !!displayMarkerDict[i];

                        return (
                            <g
                                key={measure.id}
                                transform={`translate(${x}, ${y})`}
                                onDoubleClick={() => setEditingMeasure(i)}
                                onContextMenu={(e) => handleContextMenu(e, i)}
                                style={{ cursor: 'pointer' }}
                                className="measure-group"
                            >
                                {/* 小節の縦線 */}
                                {/* ドラッグ可能な領域として太くし、カーソルを変更 */}
                                <line
                                    x1="0" y1="20"
                                    x2="0" y2={ROW_HEIGHT - 20}
                                    className={`bar-line ${hasMarker ? 'has-marker' : ''} ${dragInfo?.measureIndex === i ? 'dragging' : ''}`}
                                    onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, i); }}
                                    style={{ strokeWidth: hasMarker ? 4 : 2, cursor: 'ew-resize', stroke: hasMarker ? 'var(--warp-marker-color)' : 'var(--text-primary)' }}
                                />

                                {/* 掴みやすくするための透明な広い判定エリア */}
                                <line
                                    x1="0" y1="20"
                                    x2="0" y2={ROW_HEIGHT - 20}
                                    stroke="transparent"
                                    strokeWidth="10"
                                    cursor="ew-resize"
                                    onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, i); }}
                                />

                                {/* ダブルクリック用の背景当たり判定エリア (小節全体) */}
                                <rect
                                    x="0" y="0"
                                    width={width || 100} height={ROW_HEIGHT + 60}
                                    className={`measure-bg ${selectedMeasureIndex === i ? 'selected' : ''}`}
                                    pointerEvents="all"
                                    onClick={(e) => { e.stopPropagation(); setSelectedMeasure(i); setCurrentTime(startMs); closeContextMenu(); }}
                                    onContextMenu={(e) => { e.stopPropagation(); handleContextMenu(e, i); setSelectedMeasure(i); }}
                                    onDoubleClick={(e) => { e.stopPropagation(); setEditingMeasure(i); }}
                                    rx="4"
                                />

                                {/* 小節番号 */}
                                <text x="5" y="15" className="measure-number">
                                    {measure.index + 1}
                                </text>

                                {/* セクションマーカー */}
                                {measure.section && (
                                    <text x="5" y="-10" className="section-marker">
                                        {measure.section}
                                    </text>
                                )}

                                {/* テンポマーカー (音符をSVG図形で描画) */}
                                {measure.tempo && (
                                    <g transform="translate(5, -30)" className="tempo-marker">
                                        <g transform="translate(0, -2)">
                                            {/* 符頭 */}
                                            <ellipse cx="3" cy="0" rx="3" ry="2" transform="rotate(-15 3 0)" fill="currentColor" />
                                            {/* 符幹 */}
                                            <line x1="5.5" y1="-0.5" x2="5.5" y2="-12" stroke="currentColor" strokeWidth="1.2" />

                                            {/* 8分音符の符尾 */}
                                            {measure.tempo.baseNote === 'eighth' && (
                                                <path d="M 5.5 -12 Q 10 -8, 8 0 Q 8 -6, 5.5 -8" fill="currentColor" />
                                            )}

                                            {/* 付点4分音符の点 */}
                                            {measure.tempo.baseNote === 'dot-quarter' && (
                                                <circle cx="10" cy="-2" r="1.5" fill="currentColor" />
                                            )}
                                        </g>
                                        <text x={measure.tempo.baseNote === 'dot-quarter' ? "15" : "12"} y="0"> = {measure.tempo.bpm}</text>
                                    </g>
                                )}

                                {/* 拍子 (最初の小節または変更があった場合のみ表示) */}
                                {(i === 0 ||
                                    measure.timeSignature.num !== measures[i - 1].timeSignature.num ||
                                    measure.timeSignature.den !== measures[i - 1].timeSignature.den) && (
                                        <g transform={`translate(15, ${ROW_HEIGHT / 2 - 24})`}>
                                            <text className="time-signature">{measure.timeSignature.num}</text>
                                            <text y="32" className="time-signature">{measure.timeSignature.den}</text>
                                        </g>
                                    )}

                                {/* フェルマータ記号 (大きく中央に配置) */}
                                {measure.annotations?.includes('𝄐') && (
                                    <text x={(width || 100) / 2} y="-15" className="fermata-symbol">
                                        𝄐
                                    </text>
                                )}

                                {/* その他の注釈 (アノテーション) */}
                                {measure.annotations?.filter(anno => anno !== '𝄐').map((anno, idx) => (
                                    <text key={idx} x="5" y={ROW_HEIGHT + 20 + (idx * 15)} className="annotation-text">
                                        {anno}
                                    </text>
                                ))}
                            </g>
                        );
                    })}

                    {/* 再生カーソル */}
                    <line
                        x1={cursorX}
                        y1={cursorY}
                        x2={cursorX}
                        y2={cursorY + ROW_HEIGHT}
                        className="playback-cursor"
                    />
                </g>
            </svg>

            {/* コンテキストメニュー */}
            {contextMenu && (
                <div
                    ref={contextMenuRef}
                    className="context-menu"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                >

                    {/* 記号・マーク */}
                    <div>
                        <div className="menu-category">記号・マーク</div>
                        <div className="menu-grid">
                            <button className={`symbol-btn large ${measures[contextMenu.measureIndex]?.annotations?.includes('𝄐') ? 'active' : ''}`} title="Fermata" onClick={() => updateMeasureAnnotations(contextMenu.measureIndex, '𝄐', true)}>𝄐</button>
                            <button className={`symbol-btn ${measures[contextMenu.measureIndex]?.annotations?.includes('Break') ? 'active' : ''}`} title="Break" onClick={() => updateMeasureAnnotations(contextMenu.measureIndex, 'Break', true)}>//</button>
                        </div>
                    </div>

                    {/* テンポ */}
                    <div>
                        <div className="menu-category">テンポ</div>
                        <div className="context-menu-inline-input" style={{ marginBottom: '6px' }}>
                            <select
                                className="context-menu-input"
                                value={contextMenuTempo.baseNote}
                                onChange={e => setContextMenuTempo(prev => ({ ...prev, baseNote: e.target.value }))}
                            >
                                <option value="quarter">♩</option>
                                <option value="eighth">♪</option>
                                <option value="dot-quarter">♩.</option>
                            </select>
                            <span style={{ color: 'var(--text-muted)' }}>=</span>
                            <input
                                type="number"
                                className="context-menu-input bpm"
                                value={contextMenuTempo.bpm}
                                onChange={e => {
                                    const val = e.target.value;
                                    setContextMenuTempo(prev => ({ ...prev, bpm: val === '' ? '' : parseInt(val, 10) }));
                                }}
                                onKeyDown={e => { if (e.key === 'Enter') applyContextMenuTempo(); }}
                            />
                            <button className="symbol-btn" style={{ padding: '4px 8px' }} onClick={applyContextMenuTempo}>設定</button>
                            {contextMenu.measureIndex > 0 && measures[contextMenu.measureIndex]?.tempo && (
                                <button className="symbol-btn text-danger" style={{ padding: '4px 8px' }} onClick={clearContextMenuTempo}>クリア</button>
                            )}
                        </div>
                        {recentTempos.length > 0 && (
                            <div className="menu-grid-text" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(40px, 1fr))', marginBottom: '6px' }}>
                                {recentTempos.map((t, idx) => {
                                    const symbol = t.baseNote === 'quarter' ? '♩' : t.baseNote === 'eighth' ? '♪' : '♩.';
                                    return (
                                        <button 
                                            key={`rt-${idx}`} 
                                            className="symbol-btn small" 
                                            style={{ fontSize: '0.75rem', padding: '2px 4px' }}
                                            onClick={() => {
                                                setContextMenuTempo({ bpm: t.bpm, baseNote: t.baseNote });
                                                updateMeasure(contextMenu.measureIndex, { tempo: { bpm: t.bpm, baseNote: t.baseNote as any } });
                                                closeContextMenu();
                                            }}
                                        >
                                            {symbol}={t.bpm}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        <div className="menu-grid-text">
                            <button className={`symbol-btn ${measures[contextMenu.measureIndex]?.annotations?.includes('rit.') ? 'active' : ''}`} onClick={() => updateMeasureAnnotations(contextMenu.measureIndex, 'rit.', true)}>rit.</button>
                            <button className={`symbol-btn ${measures[contextMenu.measureIndex]?.annotations?.includes('accel.') ? 'active' : ''}`} onClick={() => updateMeasureAnnotations(contextMenu.measureIndex, 'accel.', true)}>accel.</button>
                            <button className={`symbol-btn ${measures[contextMenu.measureIndex]?.annotations?.includes('a tempo') ? 'active' : ''}`} onClick={() => updateMeasureAnnotations(contextMenu.measureIndex, 'a tempo', true)}>a tempo</button>
                            <button className={`symbol-btn ${measures[contextMenu.measureIndex]?.annotations?.includes('Rubato') ? 'active' : ''}`} onClick={() => updateMeasureAnnotations(contextMenu.measureIndex, 'Rubato', true)}>Rubato</button>
                            <button className={`symbol-btn ${measures[contextMenu.measureIndex]?.annotations?.includes('Shuffle') ? 'active' : ''}`} onClick={() => updateMeasureAnnotations(contextMenu.measureIndex, 'Shuffle', true)}>Shuffle</button>
                            <button className={`symbol-btn ${measures[contextMenu.measureIndex]?.annotations?.includes('Swing') ? 'active' : ''}`} onClick={() => updateMeasureAnnotations(contextMenu.measureIndex, 'Swing', true)}>Swing</button>
                        </div>
                    </div>

                    {/* 拍子 */}
                    <div>
                        <div className="menu-category">拍子</div>
                        <div className="context-menu-inline-input" style={{ marginBottom: '6px' }}>
                            <input
                                type="number"
                                className="context-menu-input num"
                                value={contextMenuTimeSig.num}
                                onChange={e => {
                                    const val = e.target.value;
                                    setContextMenuTimeSig(prev => ({ ...prev, num: val === '' ? '' : parseInt(val, 10) }));
                                }}
                                onKeyDown={e => { if (e.key === 'Enter') applyContextMenuTimeSig(); }}
                            />
                            <span style={{ color: 'var(--text-muted)' }}>/</span>
                            <select
                                className="context-menu-input num"
                                value={contextMenuTimeSig.den}
                                onChange={e => {
                                    const val = e.target.value;
                                    setContextMenuTimeSig(prev => ({ ...prev, den: val === '' ? '' : parseInt(val, 10) }));
                                }}
                            >
                                <option value="2">2</option>
                                <option value="4">4</option>
                                <option value="8">8</option>
                                <option value="16">16</option>
                            </select>
                            <button className="symbol-btn" style={{ padding: '4px 8px' }} onClick={applyContextMenuTimeSig}>設定</button>
                            {contextMenu.measureIndex > 0 && 
                             (measures[contextMenu.measureIndex].timeSignature.num !== measures[contextMenu.measureIndex - 1].timeSignature.num ||
                              measures[contextMenu.measureIndex].timeSignature.den !== measures[contextMenu.measureIndex - 1].timeSignature.den) && (
                                <button className="symbol-btn text-danger" style={{ padding: '4px 8px' }} onClick={clearContextMenuTimeSig}>クリア</button>
                            )}
                        </div>
                        {recentTimeSignatures.length > 0 && (
                            <div className="menu-grid-text" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(30px, 1fr))', marginBottom: '6px' }}>
                                {recentTimeSignatures.map((ts, idx) => (
                                    <button 
                                        key={`rts-${idx}`} 
                                        className="symbol-btn small" 
                                        style={{ fontSize: '0.75rem', padding: '2px 4px' }}
                                        onClick={() => {
                                            setContextMenuTimeSig({ num: ts.num, den: ts.den });
                                            updateTimeSignature(contextMenu.measureIndex, { num: ts.num, den: ts.den });
                                            closeContextMenu();
                                        }}
                                    >
                                        {ts.num}/{ts.den}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* セクション */}
                    <div>
                        <div className="menu-category">セクション</div>
                        <div className="menu-grid-text" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                            <button className={`symbol-btn ${measures[contextMenu.measureIndex]?.section === '[Intro]' ? 'active' : ''}`} onClick={() => updateMeasureSection(contextMenu.measureIndex, '[Intro]')}>Intro</button>
                            <button className={`symbol-btn ${measures[contextMenu.measureIndex]?.section === '[A]' ? 'active' : ''}`} onClick={() => updateMeasureSection(contextMenu.measureIndex, '[A]')}>[A]</button>
                            <button className={`symbol-btn ${measures[contextMenu.measureIndex]?.section === '[B]' ? 'active' : ''}`} onClick={() => updateMeasureSection(contextMenu.measureIndex, '[B]')}>[B]</button>
                            <button className={`symbol-btn ${measures[contextMenu.measureIndex]?.section === '[Chorus]' ? 'active' : ''}`} onClick={() => updateMeasureSection(contextMenu.measureIndex, '[Chorus]')}>Chorus</button>
                            <button className={`symbol-btn ${measures[contextMenu.measureIndex]?.section === '[Verse]' ? 'active' : ''}`} onClick={() => updateMeasureSection(contextMenu.measureIndex, '[Verse]')}>Verse</button>
                            <button className={`symbol-btn ${measures[contextMenu.measureIndex]?.section === '[Outro]' ? 'active' : ''}`} onClick={() => updateMeasureSection(contextMenu.measureIndex, '[Outro]')}>Outro</button>
                        </div>
                    </div>

                    <div className="menu-separator"></div>

                    {/* 小節のアクション */}
                    <div>
                        <div className="menu-item text-muted" onClick={() => { setEditingMeasure(contextMenu.measureIndex); closeContextMenu(); }}>
                            詳細エディタを開く...
                        </div>
                        <div className="menu-item" onClick={() => { insertMeasure(contextMenu.measureIndex); closeContextMenu(); }}>
                            前に小節を挿入
                        </div>
                        <div className="menu-item" onClick={() => { insertMeasure(contextMenu.measureIndex + 1); closeContextMenu(); }}>
                            後に小節を挿入
                        </div>
                        <div className="menu-item text-danger" onClick={() => { removeMeasure(contextMenu.measureIndex); closeContextMenu(); }}>
                            小節を削除
                        </div>
                        <div className="menu-item text-danger" onClick={() => { removeMeasuresAfter(contextMenu.measureIndex); closeContextMenu(); }}>
                            以降の小節をすべて削除
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
