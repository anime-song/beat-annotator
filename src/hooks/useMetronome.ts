import { useEffect, useRef } from 'react';
import { useScoreStore } from '../store';

export function useMetronome() {
    const isMetronomeEnabled = useScoreStore(state => state.isMetronomeEnabled);
    const isPlaying = useScoreStore(state => state.isPlaying);
    const currentTimeMs = useScoreStore(state => state.currentTimeMs);
    const offsetMs = useScoreStore(state => state.offsetMs);
    const measures = useScoreStore(state => state.measures);
    const warpMarkers = useScoreStore(state => state.warpMarkers);
    const metronomeVolume = useScoreStore(state => state.metronomeVolume);

    const audioCtxRef = useRef<AudioContext | null>(null);
    const nextBeatMsRef = useRef<number>(0);
    const nextBeatIndexRef = useRef<number>(0);
    
    // ノートをどれだけ先までスケジュールするか
    const scheduleAheadTimeMs = 100;
    const lookaheadIntervalMs = 25;
    const timerIDRef = useRef<number | null>(null);

    // 必要に応じてAudioContextを初期化（ユーザーインタラクションが必要）
    useEffect(() => {
        const initAudio = () => {
            if (!audioCtxRef.current) {
                audioCtxRef.current = new window.AudioContext();
            }
            if (audioCtxRef.current.state === 'suspended') {
                audioCtxRef.current.resume();
            }
        };

        // ブラウザの自動再生ポリシーに対応するため、クリックまたはキー入力時に再開/作成
        window.addEventListener('click', initAudio, { once: true });
        window.addEventListener('keydown', initAudio, { once: true });

        return () => {
            window.removeEventListener('click', initAudio);
            window.removeEventListener('keydown', initAudio);
            if (audioCtxRef.current?.state !== 'closed') {
                audioCtxRef.current?.close();
            }
        };
    }, []);



    // エフェクトの再実行をトリガーせずに現在の時間を追跡するRef
    const currentTimeMsRef = useRef(currentTimeMs);
    useEffect(() => {
        currentTimeMsRef.current = currentTimeMs;
    }, [currentTimeMs]);

    // メトリクスを追跡するためのRef
    const measuresRef = useRef(measures);
    useEffect(() => {
        measuresRef.current = measures;
    }, [measures]);

    const warpMarkersRef = useRef(warpMarkers);
    useEffect(() => {
        warpMarkersRef.current = warpMarkers;
    }, [warpMarkers]);

    // エフェクトの再実行を引き起こさずに他の値を追跡
    const offsetMsRef = useRef(offsetMs);
    useEffect(() => {
        offsetMsRef.current = offsetMs;
    }, [offsetMs]);

    const metronomeVolumeRef = useRef(metronomeVolume);
    useEffect(() => {
        metronomeVolumeRef.current = metronomeVolume;
    }, [metronomeVolume]);

    // クリック音の再生
    const playClick = (time: number, isDownbeat: boolean) => {
        if (!audioCtxRef.current) return;
        
        const osc = audioCtxRef.current.createOscillator();
        const gainNode = audioCtxRef.current.createGain();

        osc.connect(gainNode);
        gainNode.connect(audioCtxRef.current.destination);

        // ボリューム設定を適用
        const baseVol = metronomeVolumeRef.current; 
        
        // 強拍（1拍目）は強く、それ以外は弱くする
        let targetVol = isDownbeat ? baseVol * 1.5 : baseVol;
        // クリップを防ぐため、1.0を超えないようにする
        targetVol = Math.min(targetVol, 1.0);

        if (isDownbeat) {
            osc.frequency.value = 880.0; // A5
        } else {
            osc.frequency.value = 440.0; // A4
        }

        // 非常に短く、打楽器的なクリック音
        gainNode.gain.setValueAtTime(0, time);
        gainNode.gain.linearRampToValueAtTime(targetVol, time + 0.005);
        gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

        osc.start(time);
        osc.stop(time + 0.1);
    };

    // findNextBeatのためのRefを使ったヘルパー関数
    const findNextBeat = (fromAudioMs: number) => {
        let audioMs = offsetMsRef.current;
        let pBpm = 120;
        let lastAbsoluteBpm = 120; // Track the last absolute tempo for 'a tempo'
        let pBaseNote = 'quarter';
        const currentMeasures = measuresRef.current;
        const currentWarpMarkers = warpMarkersRef.current;

        const markerDict = Object.fromEntries(
            currentWarpMarkers.filter(m => m.beatOffset === 0).map(m => [m.measureIndex, m])
        );

        for (let i = 0; i < currentMeasures.length; i++) {
            const m = currentMeasures[i];
            
            if (m.tempo) {
                pBpm = m.tempo.bpm;
                lastAbsoluteBpm = m.tempo.bpm;
                pBaseNote = m.tempo.baseNote;
            }

            if (m.annotations?.includes('a tempo')) {
                pBpm = lastAbsoluteBpm;
            }

            let nextBpm = pBpm;
            let averageBpm = pBpm;

            if (m.tempoChange) {
                nextBpm = m.tempoChange.targetBpm;
                averageBpm = (pBpm + nextBpm) / 2;
            }

            const msPerBaseNote = (60 / averageBpm) * 1000;
            let quarterNoteMultiplier = 1;
            if (pBaseNote === 'eighth') quarterNoteMultiplier = 0.5;
            if (pBaseNote === 'dot-quarter') quarterNoteMultiplier = 1.5;
            
            const msPerQuarterNote = msPerBaseNote / quarterNoteMultiplier;
            const quarterNotesInMeasure = m.timeSignature.num * (4 / m.timeSignature.den);
            const autoDuration = quarterNotesInMeasure * msPerQuarterNote;

            let measureDurationMs = 0;

            if (markerDict[i + 1]) {
                measureDurationMs = markerDict[i + 1].audioTimeMs - audioMs;
                if (measureDurationMs <= 0) measureDurationMs = autoDuration;
            } else {
                measureDurationMs = autoDuration;
                if (m.fermataDurationMs) measureDurationMs += m.fermataDurationMs;
            }

            const totalBeats = m.timeSignature.num;
            // 拍数で等分割（ワープマーカーによりテンポが伸縮している状態の再現）
            const msPerBeat = measureDurationMs / totalBeats;
            
            for (let b = 0; b < totalBeats; b++) {
                const beatTimeMs = audioMs + (b * msPerBeat);
                if (beatTimeMs >= fromAudioMs) {
                    return { audioTimeMs: beatTimeMs, beatIndex: b };
                }
            }
            
            audioMs += measureDurationMs;
            pBpm = nextBpm; // 次の小節の準備
        }
        return null;
    };

    // メインのスケジューラーループ
    useEffect(() => {
        if (!isMetronomeEnabled || !isPlaying || !audioCtxRef.current) {
            if (timerIDRef.current) {
                window.clearInterval(timerIDRef.current);
                timerIDRef.current = null;
            }
            return;
        }

        if (audioCtxRef.current.state === 'suspended') {
            audioCtxRef.current.resume();
        }

        // 最初の拍を初期化
        let nextBeatInfo = findNextBeat(currentTimeMsRef.current);
        if (nextBeatInfo) {
            nextBeatMsRef.current = nextBeatInfo.audioTimeMs;
            nextBeatIndexRef.current = nextBeatInfo.beatIndex;
        }

        let lastHandledCurrentTime = currentTimeMsRef.current;
        let initialTimeMs = currentTimeMsRef.current;
        let hasAudioStartedPlaying = false;

        const scheduler = () => {
            if (!audioCtxRef.current) return;
            
            const nowMs = currentTimeMsRef.current;
            
            // オーディオが進んだかチェック
            if (!hasAudioStartedPlaying && nowMs !== initialTimeMs) {
                hasAudioStartedPlaying = true;
            }

            // シークの検出 (時間が後戻りしたか、大きく進んだ場合)
            if (Math.abs(nowMs - lastHandledCurrentTime) > 300) {
                 nextBeatInfo = findNextBeat(nowMs);
                 if (nextBeatInfo) {
                    nextBeatMsRef.current = nextBeatInfo.audioTimeMs;
                    nextBeatIndexRef.current = nextBeatInfo.beatIndex;
                 }
                 hasAudioStartedPlaying = false;
                 initialTimeMs = nowMs;
            }
            lastHandledCurrentTime = nowMs;

            // スケジュールを先読み
            while (nextBeatMsRef.current < nowMs + scheduleAheadTimeMs) {
                const secondsFromNow = (nextBeatMsRef.current - nowMs) / 1000;
                
                // 最初のビートがWebAudioとHTML5 Audioの遅延差のために早く鳴りすぎるのを防ぐ
                if (!hasAudioStartedPlaying && Math.abs(nextBeatMsRef.current - initialTimeMs) < 50) {
                    break;
                }

                // 近い将来の場合のみスケジュールする（ごく最近でない限り過去にはスケジュールしない）
                if (secondsFromNow > -0.15) { // オーディオロードや遅延の吸収のため、許容幅を拡張
                    const scheduleTime = Math.max(audioCtxRef.current.currentTime, audioCtxRef.current.currentTime + secondsFromNow);
                    playClick(scheduleTime, nextBeatIndexRef.current === 0);
                }

                const searchTime = nextBeatMsRef.current + 5; // 現在の拍の少し先を検索
                const nextInfo = findNextBeat(searchTime);
                if (nextInfo) {
                    nextBeatMsRef.current = nextInfo.audioTimeMs;
                    nextBeatIndexRef.current = nextInfo.beatIndex;
                } else {
                    nextBeatMsRef.current = Infinity;
                    break;
                }
            }
        };

        timerIDRef.current = window.setInterval(scheduler, lookaheadIntervalMs);

        return () => {
            if (timerIDRef.current) {
                window.clearInterval(timerIDRef.current);
                timerIDRef.current = null;
            }
        };
    }, [isMetronomeEnabled, isPlaying]); // 毎フレーム再起動を防ぐためcurrentTimeMsへの依存を削除
}
