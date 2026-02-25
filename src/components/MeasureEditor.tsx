import { useState, useEffect } from 'react';
import { useScoreStore, type Measure, type TempoInfo } from '../store';
import { X } from 'lucide-react';
import './MeasureEditor.css';

export function MeasureEditor() {
    const editingMeasureIndex = useScoreStore((state) => state.editingMeasureIndex);
    const setEditingMeasure = useScoreStore((state) => state.setEditingMeasure);
    const measures = useScoreStore((state) => state.measures);
    const updateMeasure = useScoreStore((state) => state.updateMeasure);

    const [formData, setFormData] = useState<Partial<Measure>>({});

    useEffect(() => {
        if (editingMeasureIndex !== null) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setFormData(measures[editingMeasureIndex] || {});
        }
    }, [editingMeasureIndex, measures]);

    if (editingMeasureIndex === null) return null;

    const measure = measures[editingMeasureIndex];
    if (!measure) return null;

    const handleClose = () => setEditingMeasure(null);

    const handleSave = () => {
        const finalData = { ...formData };
        if (finalData.timeSignature) {
            finalData.timeSignature.num = typeof finalData.timeSignature.num === 'number' ? finalData.timeSignature.num : parseInt(finalData.timeSignature.num as any, 10) || 4;
            finalData.timeSignature.den = typeof finalData.timeSignature.den === 'number' ? finalData.timeSignature.den : parseInt(finalData.timeSignature.den as any, 10) || 4;
        }
        if (finalData.tempo && typeof finalData.tempo.bpm !== 'number') {
            finalData.tempo.bpm = parseInt(finalData.tempo.bpm as any, 10) || 120;
        }
        updateMeasure(editingMeasureIndex, finalData);
        handleClose();
    };

    const handleTimeSignatureChange = (field: 'num' | 'den', value: any) => {
        setFormData(prev => ({
            ...prev,
            timeSignature: {
                ...(prev.timeSignature || measure.timeSignature),
                [field]: value
            }
        }));
    };

    const handleTempoChange = (field: keyof TempoInfo, value: string | number) => {
        setFormData(prev => ({
            ...prev,
            tempo: {
                ...(prev.tempo || { baseNote: 'quarter', bpm: 120 }),
                [field]: value
            }
        }));
    };

    const handleRemoveTempo = () => {
        setFormData(prev => {
            const next = { ...prev };
            delete next.tempo;
            return next;
        });
    };

    const handleRemoveFermata = () => {
        setFormData(prev => {
            const next = { ...prev };
            delete next.fermataDurationMs;
            // アノテーションにフェルマータ記号が存在する場合はそれも任意で削除
            if (next.annotations) {
                next.annotations = next.annotations.filter(a => a !== '𝄐');
                if (next.annotations.length === 0) delete next.annotations;
            }
            return next;
        });
    };

    const toggleAnnotation = (anno: string) => {
        setFormData(prev => {
            let current = prev.annotations || [];
            if (current.includes(anno)) {
                current = current.filter(a => a !== anno);
            } else {
                current = [...current, anno];
            }
            return {
                ...prev,
                annotations: current.length > 0 ? current : undefined
            };
        });
    };

    const PRESET_SECTIONS = ['[Intro]', '[A]', '[B]', '[Chorus]', '[Verse]', '[Bridge]', '[Outro]'];
    const PRESET_ANNOTATIONS = ['rit.', 'accel.', 'Shuffle', 'Swing', 'Rubato', 'a tempo', 'Break', '𝄐'];

    return (
        <div className="modal-overlay" onClick={handleClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>小節 {editingMeasureIndex + 1} を編集</h2>
                    <button className="icon-btn" onClick={handleClose}>
                        <X size={20} />
                    </button>
                </div>

                <div className="modal-body">
                    <div className="form-group">
                        <label>拍子</label>
                        <div className="flex-row">
                            <input
                                type="number"
                                className="input-field num-input"
                                value={formData.timeSignature?.num ?? measure.timeSignature.num}
                                onChange={e => {
                                    const val = e.target.value;
                                    handleTimeSignatureChange('num', val === '' ? '' : parseInt(val, 10));
                                }}
                            />
                            <span className="separator">/</span>
                            <select
                                className="input-field"
                                value={formData.timeSignature?.den ?? measure.timeSignature.den}
                                onChange={e => {
                                    const val = e.target.value;
                                    handleTimeSignatureChange('den', val === '' ? '' : parseInt(val, 10));
                                }}
                            >
                                <option value="2">2</option>
                                <option value="4">4</option>
                                <option value="8">8</option>
                                <option value="16">16</option>
                            </select>
                        </div>
                    </div>

                    <div className="form-separator"></div>

                    <div className="form-group">
                        <label className="flex-label">
                            <span>セクションマーカー</span>
                        </label>
                        <div className="chip-group">
                            {PRESET_SECTIONS.map(sec => (
                                <button
                                    key={sec}
                                    className={`chip ${formData.section === sec ? 'active' : ''}`}
                                    onClick={() => setFormData(prev => ({ ...prev, section: prev.section === sec ? undefined : sec }))}
                                >
                                    {sec}
                                </button>
                            ))}
                        </div>
                        <input
                            type="text"
                            className="input-field"
                            placeholder="例: [Intro], [A], [Chorus]"
                            value={formData.section || ''}
                            onChange={e => setFormData(prev => ({ ...prev, section: e.target.value }))}
                        />
                    </div>

                    <div className="form-separator"></div>

                    <div className="form-group">
                        <label className="flex-label">
                            <span>テンポ (BPM)</span>
                            {!formData.tempo && <button className="text-btn small" onClick={() => handleTempoChange('bpm', 120)}>+ 追加</button>}
                            {formData.tempo && <button className="text-btn danger small" onClick={handleRemoveTempo}>削除</button>}
                        </label>
                        {formData.tempo && (
                            <div className="flex-row">
                                <select
                                    className="input-field"
                                    value={formData.tempo.baseNote}
                                    onChange={e => handleTempoChange('baseNote', e.target.value)}
                                >
                                    <option value="quarter">♩ (4分音符)</option>
                                    <option value="eighth">♪ (8分音符)</option>
                                    <option value="dot-quarter">♩. (付点4分)</option>
                                </select>
                                <span className="separator">=</span>
                                <input
                                    type="number"
                                    className="input-field num-input"
                                    value={formData.tempo.bpm ?? 120}
                                    onChange={e => {
                                        const val = e.target.value;
                                        handleTempoChange('bpm', val === '' ? '' : parseInt(val, 10));
                                    }}
                                />
                            </div>
                        )}
                    </div>

                    <div className="form-separator"></div>

                    <div className="form-group">
                        <label className="flex-label">
                            <span>フェルマータの長さ (+ 秒)</span>
                            {formData.fermataDurationMs === undefined && (
                                <button className="text-btn small" onClick={() => {
                                    setFormData(prev => ({ ...prev, fermataDurationMs: 2000 }));
                                    // アノテーションに自動的にフェルマータ記号を追加
                                    toggleAnnotation('𝄐');
                                }}>+ 追加</button>
                            )}
                            {formData.fermataDurationMs !== undefined && (
                                <button className="text-btn danger small" onClick={handleRemoveFermata}>削除</button>
                            )}
                        </label>
                        {formData.fermataDurationMs !== undefined && (
                            <div className="flex-row">
                                <span className="separator">+</span>
                                <input
                                    type="number"
                                    className="input-field num-input"
                                    min="0"
                                    step="0.5"
                                    value={formData.fermataDurationMs / 1000}
                                    onChange={e => setFormData(prev => ({ ...prev, fermataDurationMs: parseFloat(e.target.value) * 1000 }))}
                                />
                                <span className="separator">秒</span>
                            </div>
                        )}
                    </div>

                    <div className="form-separator"></div>

                    <div className="form-group">
                        <label>注釈 (アノテーション)</label>
                        <div className="chip-group">
                            {PRESET_ANNOTATIONS.map(anno => {
                                const isActive = (formData.annotations || []).includes(anno);
                                return (
                                    <button
                                        key={anno}
                                        className={`chip ${isActive ? 'active' : ''}`}
                                        onClick={() => toggleAnnotation(anno)}
                                    >
                                        {anno}
                                    </button>
                                );
                            })}
                        </div>
                        <input
                            type="text"
                            className="input-field"
                            placeholder="例: Rubato, a tempo, Break"
                            value={(formData.annotations || []).join(', ')}
                            onChange={e => {
                                const val = e.target.value;
                                setFormData(prev => ({
                                    ...prev,
                                    annotations: val ? val.split(',').map(s => s.trim()) : undefined
                                }));
                            }}
                        />
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>* カスタムの値をカンマ区切りで入力することもできます</span>
                    </div>

                </div>

                <div className="modal-footer">
                    <button className="text-btn outline" onClick={handleClose}>キャンセル</button>
                    <button className="text-btn primary" onClick={handleSave}>変更を保存</button>
                </div>
            </div>
        </div>
    );
}
