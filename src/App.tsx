import { useEffect } from 'react';
import { Toolbar } from './components/Toolbar';
import { ScoreTimeline } from './components/ScoreTimeline';
import { WaveformContainer } from './components/WaveformContainer';
import { MeasureEditor } from './components/MeasureEditor';
import { Toast } from './components/Toast';
import { HistoryViewer } from './components/HistoryViewer';
import { SettingsModal } from './components/SettingsModal';
import { useScoreStore, initSettings } from './store';
import { useMetronome } from './hooks/useMetronome';
import './App.css';

function App() {
    // メトロノームのオーディオスケジューラーを初期化
    useMetronome();

    useEffect(() => {
        initSettings();
        
        const handleKeyDown = (e: KeyboardEvent) => {
            // IME入力中（日本語入力中など）はショートカットを無効化
            if (e.isComposing || e.keyCode === 229) {
                return;
            }

            const activeTag = document.activeElement?.tagName;
            if (
                activeTag === 'INPUT' ||
                activeTag === 'TEXTAREA' ||
                activeTag === 'SELECT' ||
                (document.activeElement as HTMLElement)?.isContentEditable
            ) {
                return;
            }

            if (e.code === 'Space' || e.key === ' ') {
                e.preventDefault();
                // ボタン等にフォーカスが残っている場合にSpaceキーでクリック発火するのを防ぐ
                if (document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur();
                }
                const currentIsPlaying = useScoreStore.getState().isPlaying;
                useScoreStore.getState().setPlaying(!currentIsPlaying);
            } else if (e.code === 'KeyM' || e.key.toLowerCase() === 'm' || e.key === 'ｍ') {
                e.preventDefault();
                if (document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur();
                }
                const currentMetronome = useScoreStore.getState().isMetronomeEnabled;
                useScoreStore.getState().setMetronomeEnabled(!currentMetronome);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const isHistoryViewerOpen = useScoreStore((state) => state.isHistoryViewerOpen);

    return (
        <div className="app-container">
            <Toolbar />
            <div className="main-content">
                <div className="waveform-section">
                    <WaveformContainer />
                </div>
                <div className="timeline-section">
                    <ScoreTimeline />
                </div>
            </div>
            <MeasureEditor />
            <div className="status-bar">
                <span>準備完了</span>
            </div>
            <Toast />
            <SettingsModal />
            {isHistoryViewerOpen && (
                <HistoryViewer onClose={() => useScoreStore.getState().setHistoryViewerOpen(false)} />
            )}
        </div>
    );
}

export default App;
