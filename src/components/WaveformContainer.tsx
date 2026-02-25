import { useEffect, useRef, useState, useMemo } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Upload } from 'lucide-react';
import { useScoreStore } from '../store';

export function WaveformContainer() {
    const containerRef = useRef<HTMLDivElement>(null);
    const wavesurferRef = useRef<WaveSurfer | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const isPlaying = useScoreStore((state) => state.isPlaying);
    const setPlaying = useScoreStore((state) => state.setPlaying);
    const setCurrentTime = useScoreStore((state) => state.setCurrentTime);
    const setDuration = useScoreStore((state) => state.setDuration);
    const setAudioFileName = useScoreStore((state) => state.setAudioFileName);
    const zoomLevel = useScoreStore((state) => state.zoomLevel);
    const currentTimeMs = useScoreStore((state) => state.currentTimeMs);
    const lastAudioProcessTimeMsRef = useRef<number>(-1);

    // 波形上に小節線を描画するため
    const measures = useScoreStore((state) => state.measures);
    const offsetMs = useScoreStore((state) => state.offsetMs);
    const warpMarkers = useScoreStore((state) => state.warpMarkers);

    const [hasAudio, setHasAudio] = useState(false);

    useEffect(() => {
        if (!containerRef.current) return;

        // wavesurferの初期化
        const ws = WaveSurfer.create({
            container: containerRef.current,
            waveColor: 'rgba(59, 130, 246, 0.4)', // var(--waveform-color) with opacity
            progressColor: 'rgba(96, 165, 250, 0.9)', // var(--waveform-progress)
            cursorColor: '#e2e8f0', // var(--text-primary)
            barWidth: 2,
            barGap: 1,
            barRadius: 2,
            height: 100,
            normalize: true,
            minPxPerSec: zoomLevel,
            fillParent: false, // 短いオーディオでも正確なzoomLevelを保証する
            backend: 'WebAudio', // HTML5 AudioのシークズレやVBRオーディオのタイミングドリフトを防止する
        });

        // イベントリスナー
        ws.on('ready', () => {
            setHasAudio(true);
            setDuration(ws.getDuration() * 1000);
        });

        ws.on('audioprocess', (time) => {
            const timeMs = time * 1000;
            lastAudioProcessTimeMsRef.current = timeMs;
            setCurrentTime(timeMs);
        });

        ws.on('interaction', () => {
            const timeMs = ws.getCurrentTime() * 1000;
            lastAudioProcessTimeMsRef.current = timeMs;
            setCurrentTime(timeMs);
        });

        ws.on('play', () => setPlaying(true));
        ws.on('pause', () => setPlaying(false));
        ws.on('finish', () => setPlaying(false));

        wavesurferRef.current = ws;

        return () => {
            ws.destroy();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // currentTimeMsをストアからwavesurferに同期（外部で変更された場合、例：タイムライン等）
    useEffect(() => {
        if (!wavesurferRef.current || !hasAudio) return;

        // audioprocess等の内部発火によるcurrentTimeMsの変更は無視する
        if (Math.abs(currentTimeMs - lastAudioProcessTimeMsRef.current) < 1) {
            return;
        }

        // 外部（Timelineクリックなど）からcurrentTimeMsが変更された場合はシークする
        const wsTimeMs = wavesurferRef.current.getCurrentTime() * 1000;
        if (Math.abs(currentTimeMs - wsTimeMs) > 1) { 
            wavesurferRef.current.setTime(currentTimeMs / 1000);
            lastAudioProcessTimeMsRef.current = currentTimeMs; // 無限ループ防止
        }
    }, [currentTimeMs, hasAudio]);

    // ズームレベルの同期
    useEffect(() => {
        if (wavesurferRef.current && hasAudio) {
            wavesurferRef.current.zoom(zoomLevel);
        }
    }, [zoomLevel, hasAudio]);

    // 再生状態の同期
    useEffect(() => {
        if (!wavesurferRef.current || !hasAudio) return;

        if (isPlaying && !wavesurferRef.current.isPlaying()) {
            wavesurferRef.current.play();
        } else if (!isPlaying && wavesurferRef.current.isPlaying()) {
            wavesurferRef.current.pause();
        }
    }, [isPlaying, hasAudio]);

    // 音声アップロードイベントの処理
    useEffect(() => {
        const handleFileUpload = (e: Event) => {
            const customEvent = e as CustomEvent;
            const file = customEvent.detail?.file;
            if (file && wavesurferRef.current) {
                setHasAudio(false);
                setPlaying(false);
                // ファイル名をストアに保存
                setAudioFileName(file.name);
                const url = URL.createObjectURL(file);
                wavesurferRef.current.load(url);
            }
        };

        window.addEventListener('audio-upload', handleFileUpload);
        return () => {
            window.removeEventListener('audio-upload', handleFileUpload);
        };
    }, [setPlaying]);

    const measurePositions = useMemo(() => {
        const markerDict = Object.fromEntries(
            warpMarkers.filter(m => m.beatOffset === 0).map(m => [m.measureIndex, m])
        );

        let currentBpm = 120;
        let lastAbsoluteBpm = 120;
        let currentBaseNote = 'quarter';
        let currentX = (offsetMs / 1000) * zoomLevel;

        const positions = [];
        for (let i = 0; i < measures.length; i++) {
            const measure = measures[i];
            
            if (measure.tempo) {
                currentBpm = measure.tempo.bpm;
                lastAbsoluteBpm = measure.tempo.bpm;
                currentBaseNote = measure.tempo.baseNote || 'quarter';
            }

            if (measure.annotations?.includes('a tempo')) {
                currentBpm = lastAbsoluteBpm;
            }

            let nextBpm = currentBpm;
            let averageBpm = currentBpm;

            if (markerDict[i]) {
                currentX = (markerDict[i].audioTimeMs / 1000) * zoomLevel;
            }

            const positionX = currentX;

            let measurePxWidth = 0;
            if (markerDict[i + 1]) {
                const nextX = (markerDict[i + 1].audioTimeMs / 1000) * zoomLevel;
                measurePxWidth = nextX - currentX;
            } else {
                const beatsInMeasure = measure.timeSignature.num * (4 / measure.timeSignature.den);
                const secPerBaseNote = 60 / averageBpm;
                let quarterNoteMultiplier = 1;
                if (currentBaseNote === 'eighth') quarterNoteMultiplier = 0.5;
                if (currentBaseNote === 'dot-quarter') quarterNoteMultiplier = 1.5;
                const secPerQuarterNote = secPerBaseNote / quarterNoteMultiplier;
                
                let measureDurationSec = beatsInMeasure * secPerQuarterNote;

                if (measure.fermataDurationMs) {
                    measureDurationSec += (measure.fermataDurationMs / 1000);
                }

                measurePxWidth = measureDurationSec * zoomLevel;
            }

            currentX += measurePxWidth;
            currentBpm = nextBpm;

            positions.push({ x: positionX, hasMarker: i === 0 || !!markerDict[i] });
        }
        return positions;
    }, [measures, offsetMs, zoomLevel, warpMarkers]);

    // wavesurferのスクロール位置に基づいてオーバーレイを移動する必要がある
    const overlayRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const ws = wavesurferRef.current;
        const container = containerRef.current;
        if (!ws || !hasAudio) return;

        const wrapper = ws.getWrapper();
        const overlay = overlayRef.current;
        let originalParent: ParentNode | null = null;
        
        if (wrapper && overlay) {
            // 元の親要素を記憶（Reactが正しくアンマウントできるようにするため）
            originalParent = overlay.parentNode;

            // wavesurferのスクロール可能なラッパーにオーバーレイを直接追加する
            // これにより、ブラウザネイティブの完全なスクロール同期が保証される
            
            // まずオーバーレイのスタイルを内部寸法に合わせる
            overlay.style.position = 'absolute';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100%';
            overlay.style.height = '100%';
            overlay.style.pointerEvents = 'none';
            overlay.style.zIndex = '3'; // 波形表示（0/1/2）より上

            // 必要ならReactレンダリングされた場所から削除するが、
            // 実際はReactが引き続きそれを所有し、DOM内を移動させるだけ。
            // 注：気をつけないとReactが文句を言うか上書きするかもしれないが、
            // 絶対配置された純粋なリーフノードであれば通常は問題ない。
            wrapper.appendChild(overlay);
        }

        return () => {
            // クリーンアップ：アンマウント時にラッパーからオーバーレイを削除する
            if (wrapper && overlay && overlay.parentNode === wrapper) {
                // Reactが通常通りアンマウントできるように元の親に戻す。親がない場合は直接削除する。
                if (originalParent) {
                    originalParent.appendChild(overlay);
                } else if (container) {
                    container.appendChild(overlay);
                } else {
                    overlay.remove();
                }
            }
        };
    }, [hasAudio]);

    const handleEmptyStateUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const event = new CustomEvent('audio-upload', { detail: { file: e.target.files[0] } });
            window.dispatchEvent(event);
        }
    };

    return (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
            {!hasAudio && (
                <div style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    backgroundColor: 'var(--bg-surface)',
                    zIndex: 10,
                }}>
                    <input
                        type="file"
                        accept="audio/*"
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        onChange={handleFileInputChange}
                    />
                    <button
                        onClick={handleEmptyStateUploadClick}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '12px 24px',
                            backgroundColor: 'var(--accent-primary)',
                            color: 'white',
                            borderRadius: '8px',
                            fontSize: '1rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            border: 'none',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                            transition: 'all 0.2s',
                        }}
                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--accent-primary-hover)'}
                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'var(--accent-primary)'}
                    >
                        <Upload size={20} />
                        音声ファイルをアップロード
                    </button>
                    <p style={{ marginTop: '16px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        WAV, MP3, OGG に対応
                    </p>
                </div>
            )}
            <div
                ref={containerRef}
                style={{
                    width: '100%',
                    height: '100%',
                    opacity: hasAudio ? 1 : 0.2,
                    transition: 'opacity 0.3s ease',
                    position: 'relative'
                }}
            >
                {/* 小節マーカーのオーバーレイ */}
                {hasAudio && (
                    <div style={{
                        position: 'absolute',
                        top: 0, left: 0, right: 0, bottom: 0,
                        pointerEvents: 'none',
                        overflow: 'hidden',
                        zIndex: 2,
                    }}>
                        <div ref={overlayRef} style={{ transform: `translateX(0px)`, width: '100%', height: '100%' }}>
                            {measurePositions.map((pos, i) => (
                                <div key={`wf-line-${i}`} style={{ position: 'absolute', left: `${pos.x}px`, top: 0, bottom: 0 }}>
                                    {/* 小節線 */}
                                    <div
                                        style={{
                                            position: 'absolute',
                                            left: 0,
                                            top: 0,
                                            bottom: 0,
                                            width: pos.hasMarker ? '2px' : '1px',
                                            backgroundColor: pos.hasMarker ? 'var(--warp-marker-color)' : 'rgba(255, 255, 255, 0.4)',
                                        }}
                                    />
                                    {/* 小節番号 */}
                                    <div
                                        style={{
                                            position: 'absolute',
                                            left: '4px',
                                            top: '4px',
                                            fontSize: '12px',
                                            fontWeight: 'bold',
                                            color: pos.hasMarker ? 'var(--warp-marker-color)' : 'rgba(255, 255, 255, 0.8)',
                                            textShadow: '1px 1px 2px rgba(0, 0, 0, 0.8)',
                                            pointerEvents: 'none',
                                            userSelect: 'none'
                                        }}
                                    >
                                        {i + 1}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
