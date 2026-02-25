import { useEffect } from 'react';
import { useScoreStore } from '../store';
import './Toast.css';
import { Info, CheckCircle, AlertCircle, X } from 'lucide-react';

export function Toast() {
    const toast = useScoreStore((state) => state.toast);
    const hideToast = useScoreStore((state) => state.hideToast);

    useEffect(() => {
        if (toast?.visible) {
            const timer = setTimeout(() => {
                hideToast();
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [toast, hideToast]);

    if (!toast || !toast.visible) return null;

    const Icon = toast.type === 'success' ? CheckCircle : toast.type === 'error' ? AlertCircle : Info;

    return (
        <div className={`toast-container toast-${toast.type}`}>
            <Icon size={20} className="toast-icon" />
            <span className="toast-message">{toast.message}</span>
            <button className="toast-close-btn" onClick={hideToast}>
                <X size={16} />
            </button>
        </div>
    );
}
