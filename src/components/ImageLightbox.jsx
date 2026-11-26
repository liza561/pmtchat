import React, { useState, useEffect } from 'react';
import { X, ZoomIn, ZoomOut, Download } from 'lucide-react';

export default function ImageLightbox({ url, fileName, onClose }) {
const [scale, setScale] = useState(1);

useEffect(() => {
    const handleKeyDown = (e) => {
        if (e.key === 'Escape') onClose();
        if (e.key === '+' || e.key === '=') {
            setScale(s => Math.min(4, s + 0.25));
        }
        if (e.key === '-') {
            setScale(s => Math.max(0.25, s - 0.25));
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = '';
    };
}, [onClose]);

if (!url) return null;

return (
    <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        onClick={onClose}
    >
        {/* Lightbox */}
        <div
            className="flex h-full max-h-[95vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={e => e.stopPropagation()}
        >
            {/* Header */}
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5">

                <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                        <svg
                            width="19"
                            height="19"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                        >
                            <rect x="3" y="3" width="18" height="18" rx="3" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <path d="m21 15-5-5L5 21" />
                        </svg>
                    </div>

                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                            {fileName || 'Image Preview'}
                        </p>
                        <p className="text-xs text-slate-500">
                            Image preview
                        </p>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-2">

                    <button
                        onClick={() => setScale(s => Math.max(0.25, s - 0.25))}
                        disabled={scale <= 0.25}
                        title="Zoom out"
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30"
                    >
                        <ZoomOut size={18} />
                    </button>

                    <span className="w-12 text-center text-xs font-medium text-slate-600">
                        {Math.round(scale * 100)}%
                    </span>

                    <button
                        onClick={() => setScale(s => Math.min(4, s + 0.25))}
                        disabled={scale >= 4}
                        title="Zoom in"
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30"
                    >
                        <ZoomIn size={18} />
                    </button>

                    <div className="mx-1 h-6 w-px bg-slate-200" />

                    <a
                        href={url}
                        download={fileName}
                        target="_blank"
                        rel="noreferrer"
                        title="Download image"
                        className="flex h-9 items-center gap-2 rounded-lg bg-blue-700 px-3 text-sm font-medium text-white transition hover:bg-blue-800"
                    >
                        <Download size={16} />
                        <span className="hidden sm:inline">Download</span>
                    </a>

                    <button
                        onClick={onClose}
                        title="Close"
                        className="ml-1 flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-red-50 hover:text-red-600"
                    >
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* Image Area */}
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-slate-50 p-6">
                <img
                    src={url}
                    alt={fileName || 'Image preview'}
                    draggable={false}
                    className="max-h-full max-w-full select-none object-contain transition-transform duration-200"
                    style={{
                        transform: `scale(${scale})`,
                        transformOrigin: 'center center',
                    }}
                />
            </div>
        </div>
    </div>
);


}
