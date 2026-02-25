import { create } from 'zustand';
import { temporal } from 'zundo';
import { get, set as setIDB } from 'idb-keyval';

export type TimeSignature = {
  num: number;
  den: number;
};

export type TempoInfo = {
  baseNote: 'quarter' | 'eighth' | 'dot-quarter';
  bpm: number;
};

export type TempoChange = {
  type: 'rit.' | 'accel.';
  targetBpm: number;
};

export type Measure = {
  id: string;
  index: number;
  timeSignature: TimeSignature;
  tempo?: TempoInfo; // この小節の開始時にテンポ変更がある場合のみ指定
  tempoChange?: TempoChange; // 小節全体で徐々にテンポが変化する場合
  fermataDurationMs?: number; // フェルマータのためにこの小節の長さに加算する追加時間
  section?: string;  // 例: '[Intro]'
  annotations?: string[]; // 例: ['Rubato']
};

export type WarpMarker = {
  id: string;
  measureIndex: number;
  beatOffset: number;   // 0: 強拍(ダウンビート), 1: 2拍目 など
  audioTimeMs: number;
};

export type ScoreState = {
  // --- プロジェクト設定 ---
  offsetMs: number;
  audioFileName: string | null;
  fileHandle: any | null;
  
  // --- デフォルトフォルダ設定 ---
  beatFolderHandle: any | null;
  audioFolderHandle: any | null;
  
  // --- スコアデータ ---
  measures: Measure[];
  warpMarkers: WarpMarker[];

  // --- UI/再生状態 ---
  isPlaying: boolean;
  currentTimeMs: number;
  durationMs: number;
  zoomLevel: number; // 1秒あたりのピクセル数、または類似のスケール
  selectedMeasureIndex: number | null; // キーボードナビゲーションのハイライト用
  editingMeasureIndex: number | null; // ダイアログが開いていない時はnull
  isMetronomeEnabled: boolean;
  metronomeVolume: number; // 0.0 から 1.0
  toast: { message: string, type: 'success' | 'error' | 'info', visible: boolean } | null;
  lastAction: string | null;
  isHistoryViewerOpen: boolean;
  isSettingsOpen: boolean;
  
  // --- 入力履歴 ---
  recentTempos: TempoInfo[];
  recentTimeSignatures: TimeSignature[];

  // --- アクション ---
  setOffsetMs: (offset: number) => void;
  setAudioFileName: (name: string | null) => void;
  setFileHandle: (handle: any | null) => void;
  setBeatFolderHandle: (handle: any | null) => void;
  setAudioFolderHandle: (handle: any | null) => void;
  setSettingsOpen: (isOpen: boolean) => void;
  setPlaying: (isPlaying: boolean) => void;
  setCurrentTime: (timeMs: number) => void;
  setDuration: (durationMs: number) => void;
  setZoom: (zoom: number) => void;
  setSelectedMeasure: (index: number | null) => void;
  setEditingMeasure: (index: number | null) => void;
  setMetronomeEnabled: (enabled: boolean) => void;
  setMetronomeVolume: (volume: number) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  hideToast: () => void;
  addRecentTempo: (tempo: TempoInfo) => void;
  addRecentTimeSignature: (ts: TimeSignature) => void;
  setHistoryViewerOpen: (isOpen: boolean) => void;
  
  // 小節のアクション
  addMeasure: (measure: Measure) => void;
  addMeasures: (count: number) => void;
  updateMeasure: (index: number, updates: Partial<Measure>) => void;
  updateTimeSignature: (startIndex: number, timeSignature: TimeSignature) => void;
  insertMeasure: (index: number) => void;
  removeMeasure: (index: number) => void;
  removeMeasuresAfter: (index: number) => void; // 指定インデックス以降の小節をすべて削除
  
  // ワープマーカーのアクション
  addWarpMarker: (marker: WarpMarker) => void;
  updateWarpMarker: (id: string, timeMs: number) => void;
  removeWarpMarker: (id: string) => void;
};

// 開発用の初期プレースホルダーデータ
const initialMeasures: Measure[] = Array.from({ length: 20 }).map((_, i) => ({
  id: `m_${i}`,
  index: i,
  timeSignature: { num: 4, den: 4 },
  ...(i === 0 ? { tempo: { baseNote: 'quarter', bpm: 120 } } : {}),
}));

export const useScoreStore = create<ScoreState>()(temporal((set) => ({
  offsetMs: 0,
  audioFileName: null,
  fileHandle: null,
  beatFolderHandle: null,
  audioFolderHandle: null,
  measures: initialMeasures,
  warpMarkers: [],
  
  isPlaying: false,
  currentTimeMs: 0,
  durationMs: 0,
  zoomLevel: 100,
  selectedMeasureIndex: null,
  editingMeasureIndex: null,
  isMetronomeEnabled: false,
  metronomeVolume: 0.5,
  toast: null,
  lastAction: null,
  isHistoryViewerOpen: false,
  isSettingsOpen: false,
  recentTempos: [],
  recentTimeSignatures: [],

  setOffsetMs: (offsetMs) => set({ offsetMs }),
  setAudioFileName: (name) => set({ audioFileName: name }),
  setFileHandle: (handle) => set({ fileHandle: handle }),
  setBeatFolderHandle: (handle) => {
    set({ beatFolderHandle: handle });
    setIDB('beatFolderHandle', handle).catch(console.error);
  },
  setAudioFolderHandle: (handle) => {
    set({ audioFolderHandle: handle });
    setIDB('audioFolderHandle', handle).catch(console.error);
  },
  setSettingsOpen: (isOpen) => set({ isSettingsOpen: isOpen }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTime: (currentTimeMs) => set({ currentTimeMs }),
  setDuration: (durationMs) => set({ durationMs }),
  setZoom: (zoomLevel) => set({ zoomLevel }),
  setSelectedMeasure: (index) => set({ selectedMeasureIndex: index }),
  setEditingMeasure: (index) => set({ editingMeasureIndex: index }),
  setMetronomeEnabled: (enabled) => set({ isMetronomeEnabled: enabled }),
  setMetronomeVolume: (volume) => set({ metronomeVolume: volume }),
  showToast: (message, type = 'info') => set({ toast: { message, type, visible: true } }),
  hideToast: () => set((state) => state.toast ? { toast: { ...state.toast, visible: false } } : state),
  setHistoryViewerOpen: (isOpen) => set({ isHistoryViewerOpen: isOpen }),
  
  addRecentTempo: (tempo) => set((state) => {
    const exists = state.recentTempos.find(t => t.bpm === tempo.bpm && t.baseNote === tempo.baseNote);
    if (exists) return state;
    return { recentTempos: [tempo, ...state.recentTempos].slice(0, 5) };
  }),
  
  addRecentTimeSignature: (ts) => set((state) => {
    const exists = state.recentTimeSignatures.find(t => t.num === ts.num && t.den === ts.den);
    if (exists) return state;
    return { recentTimeSignatures: [ts, ...state.recentTimeSignatures].slice(0, 5) };
  }),

  addMeasure: (measure) => set((state) => ({ measures: [...state.measures, measure], lastAction: '小節を追加' })),
  addMeasures: (count) => set((state) => {
    const newMeasures = [...state.measures];
    let lastSign = { num: 4, den: 4 };
    if (newMeasures.length > 0) {
      lastSign = { ...newMeasures[newMeasures.length - 1].timeSignature };
    }
    const startIndex = newMeasures.length;
    for (let i = 0; i < count; i++) {
      newMeasures.push({
        id: `m_${Date.now()}_${Math.floor(Math.random() * 1000)}_${i}`,
        index: startIndex + i,
        timeSignature: { ...lastSign }
      });
    }
    return { measures: newMeasures, lastAction: `${count}小節を追加` };
  }),
  updateMeasure: (index, updates) => set((state) => {
    const newMeasures = [...state.measures];
    newMeasures[index] = { ...newMeasures[index], ...updates };
    return { measures: newMeasures, lastAction: '小節を編集' };
  }),
  updateTimeSignature: (startIndex, timeSignature) => set((state) => {
    const newMeasures = [...state.measures];
    const oldSig = newMeasures[startIndex].timeSignature;
    for (let i = startIndex; i < newMeasures.length; i++) {
      if (newMeasures[i].timeSignature.num === oldSig.num && newMeasures[i].timeSignature.den === oldSig.den) {
        newMeasures[i] = { ...newMeasures[i], timeSignature: { ...timeSignature } };
      } else {
        break;
      }
    }
    return { measures: newMeasures, lastAction: '拍子を変更' };
  }),
  insertMeasure: (index) => set((state) => {
    const newMeasures = [...state.measures];
    const prevMeasure = index > 0 ? newMeasures[index - 1] : null;
    const newMeasure: Measure = {
      id: `m_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      index, // 下記で再計算される
      timeSignature: prevMeasure ? { ...prevMeasure.timeSignature } : { num: 4, den: 4 },
    };
    newMeasures.splice(index, 0, newMeasure);
    // インデックスの再計算
    newMeasures.forEach((m, i) => { m.index = i; });
    
    // ワープマーカーの更新
    const newWarpMarkers = state.warpMarkers.map(marker => {
      if (marker.measureIndex >= index) {
        return { ...marker, measureIndex: marker.measureIndex + 1 };
      }
      return marker;
    });

    return { measures: newMeasures, warpMarkers: newWarpMarkers, lastAction: '小節を挿入' };
  }),
  removeMeasure: (index) => set((state) => {
    if (state.measures.length <= 1) return state; // 最後の小節が削除されるのを防ぐ
    
    const newMeasures = [...state.measures];
    newMeasures.splice(index, 1);
    // インデックスの再計算
    newMeasures.forEach((m, i) => { m.index = i; });

    // ワープマーカーの更新: 削除された小節のマーカーを削除し、後続のマーカーをシフトする
    const newWarpMarkers = state.warpMarkers
      .filter(marker => marker.measureIndex !== index)
      .map(marker => {
        if (marker.measureIndex > index) {
          return { ...marker, measureIndex: marker.measureIndex - 1 };
        }
        return marker;
      });

    return { measures: newMeasures, warpMarkers: newWarpMarkers, lastAction: '小節を削除' };
  }),
  removeMeasuresAfter: (index) => set((state) => {
    // index自身は残し、それ以降（index + 1 〜 最後まで）を削除する
    // ただし、もしindexが0で全て消えそうな場合は1小節だけ残すなど安全策をとるが、
    // 基本は「指定した小節までは残す」なので最低でも1小節は残る。
    if (index >= state.measures.length - 1) return state; // 既に最後の小節が選択されている場合は何もしない
    
    const newMeasures = state.measures.slice(0, index + 1);
    
    // ワープマーカーの更新: 削除された小節のマーカーを削除
    const newWarpMarkers = state.warpMarkers.filter(marker => marker.measureIndex <= index);

    return { measures: newMeasures, warpMarkers: newWarpMarkers, lastAction: '以降の小節をすべて削除' };
  }),

  addWarpMarker: (marker) => set((state) => ({ warpMarkers: [...state.warpMarkers, marker], lastAction: 'ワープマーカーを追加' })),
  updateWarpMarker: (id, audioTimeMs) => set((state) => ({
    warpMarkers: state.warpMarkers.map((m) => m.id === id ? { ...m, audioTimeMs } : m),
    lastAction: 'ワープマーカーを移動'
  })),
  removeWarpMarker: (id) => set((state) => ({
    warpMarkers: state.warpMarkers.filter((m) => m.id !== id),
    lastAction: 'ワープマーカーを削除'
  })),
}), {
  partialize: (state) => {
    const { measures, warpMarkers, offsetMs, lastAction } = state;
    return { measures, warpMarkers, offsetMs, lastAction };
  },
  equality: (pastState, currentState) => {
    return pastState.measures === currentState.measures &&
           pastState.warpMarkers === currentState.warpMarkers &&
           pastState.offsetMs === currentState.offsetMs;
  }
}));

// 設定の初期化処理
export const initSettings = async () => {
  try {
    const beatFolderHandle = await get('beatFolderHandle');
    const audioFolderHandle = await get('audioFolderHandle');
    
    if (beatFolderHandle) {
      useScoreStore.getState().setBeatFolderHandle(beatFolderHandle);
    }
    if (audioFolderHandle) {
      useScoreStore.getState().setAudioFolderHandle(audioFolderHandle);
    }
  } catch (error) {
    console.error('Failed to load settings from IndexedDB:', error);
  }
};

export const verifyPermission = async (fileHandle: any, withWrite: boolean = false) => {
  const opts = { mode: (withWrite ? 'readwrite' : 'read') as 'read' | 'readwrite' };
  
  if (await fileHandle.queryPermission(opts) === 'granted') {
    return true;
  }
  
  if (await fileHandle.requestPermission(opts) === 'granted') {
    return true;
  }
  
  return false;
};
