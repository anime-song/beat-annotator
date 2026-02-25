import { useStore } from 'zustand';
import { useScoreStore } from '../store';
import { X, History, ArrowLeft, ArrowRight } from 'lucide-react';
import './HistoryViewer.css';

interface HistoryViewerProps {
    onClose: () => void;
}

export function HistoryViewer({ onClose }: HistoryViewerProps) {
    const { pastStates, futureStates } = useStore(useScoreStore.temporal);
    const presentState = useScoreStore();
    const { undo, redo } = useScoreStore.temporal.getState();

    return (
        <div className="history-viewer-overlay" onClick={onClose}>
            <div className="history-viewer-content" onClick={e => e.stopPropagation()}>
                <div className="history-header">
                    <h2><History size={20} style={{ marginRight: '8px' }} /> 操作履歴</h2>
                    <button className="icon-btn" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                <div className="history-body">
                    <p style={{ marginBottom: '16px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        これまでの操作の履歴一覧です。上から古い順に並んでいます。ここから過去の状態に戻したり、やり直したりすることができます。
                    </p>

                    <div className="history-list">
                        {/* 過去の状態 */}
                        {pastStates.map((state, index) => {
                            const stepsBack = pastStates.length - index;
                            return (
                                <div 
                                    key={`past-${index}`} 
                                    className="history-item past clickable"
                                    onClick={() => undo(stepsBack)}
                                    title={`${stepsBack} つ前の状態に戻す`}
                                >
                                    <div className="history-item-header">
                                        <span className="history-badge">過去 {index + 1}</span>
                                        <span className="history-action">{state.lastAction || '不明な操作'}</span>
                                    </div>
                                    <div className="history-details">
                                        小節数: {state.measures?.length || 0} | マーカー数: {state.warpMarkers?.length || 0} | オフセット: {state.offsetMs}ms
                                    </div>
                                </div>
                            );
                        })}

                        {/* 現在の状態 */}
                        <div className="history-item present">
                            <div className="history-item-header">
                                <span className="history-badge current">現在</span>
                                <span className="history-action">{presentState.lastAction || '最新の状態'}</span>
                            </div>
                            <div className="history-details">
                                小節数: {presentState.measures?.length || 0} | マーカー数: {presentState.warpMarkers?.length || 0} | オフセット: {presentState.offsetMs}ms
                            </div>
                        </div>

                        {/* 未来の状態 (Redo可能) */}
                        {futureStates.map((state, index) => {
                            const stepsForward = index + 1;
                            return (
                                <div 
                                    key={`future-${index}`} 
                                    className="history-item future clickable"
                                    onClick={() => redo(stepsForward)}
                                    title={`${stepsForward} つ後の状態にやり直す`}
                                >
                                    <div className="history-item-header">
                                        <span className="history-badge redo">未来 {index + 1}</span>
                                        <span className="history-action">{state.lastAction || '不明な操作'}</span>
                                    </div>
                                    <div className="history-details">
                                        小節数: {state.measures?.length || 0} | マーカー数: {state.warpMarkers?.length || 0} | オフセット: {state.offsetMs}ms
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="history-actions" style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'center' }}>
                        <button 
                            className="text-btn" 
                            disabled={pastStates.length === 0} 
                            onClick={() => undo()}
                            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                            <ArrowLeft size={16} /> 1つ戻す
                        </button>
                        <button 
                            className="text-btn" 
                            disabled={futureStates.length === 0} 
                            onClick={() => redo()}
                            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                            1つやり直す <ArrowRight size={16} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
