import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useNotes } from '../context/AppContext';
import * as api from '../lib/api';
import { ArrowLeft, Pin, Trash2, Check, FileText, Clock3, Palette, Save, Loader2, Plus, Info, } from 'lucide-react';

const COLORS = ['#ffffff','#d1fae5','#ede9fe','#fee2e2','#fef9c3','#e0f2fe','#fdf2f8',];

const DEFAULT_NOTE = {
    id: '',
    title: '',
    content: '',
    color: '#ffffff',
    pinned: false,
    category: '',
};

export default function NoteDetails() {

    const navigate = useNavigate();
    const { id } = useParams();
    const { notes, loading, save, remove, togglePin } = useNotes();
    const isNew = id === 'new';
    const [note, setNote] = useState(DEFAULT_NOTE);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [initialized, setInitialized] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (loading) return;

        if (isNew) {
            setNote({ ...DEFAULT_NOTE });
            setInitialized(true);
            return;
        }

        const existingNote = notes.find(item => item.id === id);

        if (existingNote) {
            setNote({ ...existingNote });
        }

        setInitialized(true);
    }, [id, loading, isNew]);

    // UPDATE FIELD

    const updateField = (field, value) => {

        setNote(previous => ({
            ...previous,
            [field]: value,
        }));

    };

    const formatDate = (date) => {

        if (!date) return 'Just now';

        const parsed = new Date(date);

        if (Number.isNaN(parsed.getTime())) {
            return 'Recently';
        }

        return parsed.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        });

    };

    const handleSave = async () => {

        if (!note.title.trim()) {
            setError('Please enter a note title.');
            return;
        }

        try {

            setSaving(true);
            setError('');

            const noteId = note.id || await api.generateUuid();

            await save({
                id: noteId,
                title: note.title.trim(),
                content: note.content || '',
                color: note.color || '#ffffff',
                pinned: Boolean(note.pinned),
                category: note.category?.trim() || '',
                created_at: note.created_at || undefined,
            });

            navigate('/notes', { replace: true, });

        } catch (err) {
            console.error('Failed to save note:', err);
            setError('Unable to save your note. Please try again.');
        } finally {
            setSaving(false);
        }

    };

    const handleDelete = async () => {

        if (!note.id) {
            navigate('/notes');
            return;
        }

        try {

            setDeleting(true);
            await remove(note.id);
            navigate('/notes', { replace: true, });

        } catch (err) {

            console.error('Failed to delete note:', err);
            setError('Unable to delete this note.');
            setDeleting(false);

        }

    };


    const handlePin = async () => {

        if (!note.id) {

            updateField('pinned', !note.pinned);
            return;

        }

        await togglePin(note.id);

        updateField('pinned', !note.pinned);

    };


    if (loading || !initialized) {

        return (
            <div className="flex h-full items-center justify-center bg-[#f8f9fc]">

                <div className="flex items-center gap-3 text-sm text-slate-500">
                    <Loader2 size={20} className="animate-spin text-blue-600" />
                    Loading note...
                </div>

            </div>
        );

    }

    // NOTE NOT FOUND

    if (!isNew && !notes.some(item => item.id === id)) {

        return (
            <div className="flex h-full flex-col items-center justify-center bg-[#f8f9fc]">

                <FileText size={40} className="mb-4 text-slate-300" />

                <h2 className="text-lg font-bold text-slate-800"> Note not found </h2>
                <p className="mt-2 text-sm text-slate-500"> This note may have been deleted. </p>

                <button onClick={() => navigate('/notes')}
                    className="mt-5 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                >
                    Back
                </button>

            </div>
        );

    }

    return (

        <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#f8f9fc]">

            {/* TOP NAVIGATION */}

            <header className="shrink-0 border-b border-slate-200/70 bg-white">

                <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between gap-4 px-5 pb-2 sm:px-8">

                    <button
                        onClick={() => navigate('/notes')}
                        className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-blue-600"
                    >
                        <ArrowLeft size={18} />
                        <span>Back to Notes</span>
                    </button>

                    <div className="flex items-center gap-2">

                        {!isNew && (

                            <button
                                onClick={handlePin}
                                title={note.pinned ? 'Unpin note' : 'Pin note'}
                                className={`flex h-10 w-10 items-center justify-center rounded-xl border transition ${note.pinned
                                    ? 'border-amber-200 bg-amber-50 text-amber-600'
                                    : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                                    }`}
                            >
                                <Pin size={17} className={note.pinned ? 'rotate-[-35deg] fill-current' : ''} />
                            </button>

                        )}

                        {!isNew && (

                            <button
                                onClick={handleDelete}
                                disabled={deleting}
                                title="Delete note"
                                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                            >
                                <Trash2 size={17} />
                            </button>

                        )}

                        <button onClick={handleSave} disabled={saving || !note.title.trim()}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm 
                            font-semibold text-white shadow-md shadow-blue-600/15 transition hover:bg-blue-700 
                            disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Save Changes

                        </button>

                    </div>

                </div>

            </header>

            {/* EDITOR */}

            <main className="flex-1 overflow-y-auto">

                <div className="mx-auto w-full max-w-[900px] px-5 py-5 sm:px-8">

                    {/* PAGE TITLE */}

                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">

                        {/* Left Side */}
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-blue-600">
                            <FileText size={15} />
                            {isNew ? 'New Note' : 'Note Editor'}
                        </div>

                        {/* Right Side */}
                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">

                            {!isNew && (
                                <>
                                    <span>Last edited</span>
                                    <span>·</span>
                                    <span>{formatDate(note.updated_at)}</span>
                                </>
                            )}

                            {note.pinned && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-600">
                                    <Pin size={11} />
                                    Pinned
                                </span>
                            )}

                        </div>

                    </div>

                    {/* EDITOR CARD */}

                    <div style={{ backgroundColor: note.color || '#ffffff', }}
                        className="overflow-hidden rounded-3xl border border-slate-200/80 shadow-sm"
                    >

                        <div className="p-3 sm:p-6">

                            <input
                                type="text"
                                placeholder="Give your note a title..."
                                value={note.title}
                                maxLength={40}
                                onChange={e => updateField('title', e.target.value)}
                                autoFocus
                                className="mb-3 w-full border-0 bg-transparent text-lg font-bold tracking-tight text-slate-900 outline-none placeholder:text-slate-300"
                            />
                            <div className="mb-4 h-px bg-black/[0.07]" />

                            <textarea
                                placeholder="Start writing your thoughts..."
                                value={note.content}
                                onChange={e => updateField('content', e.target.value)}
                                className="min-h-[450px] w-full resize-y border-0 bg-transparent text-[15px] leading-[2] text-slate-700 outline-none placeholder:text-slate-300"
                            />

                        </div>

                        {/* FOOTER */}

                        <div className="flex flex-col gap-5 border-t border-black/[0.07] bg-white/40 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">

                            <div className="w-full sm:max-w-xs">

                                <div className="flex items-center justify-between px-2">
                                    <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">
                                        Category
                                    </label>
                                    <span className="text-[12px] font-medium text-slate-400"> {(note.category || '').length}/25 </span>
                                </div>

                                <input
                                    type="text"
                                    placeholder="e.g. Work, Personal, Ideas"
                                    value={note.category || ''}
                                    maxLength={25}
                                    onChange={e => updateField('category', e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 bg-white/80 px-4 py-1.5 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                                />

                            </div>

                            <div>

                                <label className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">

                                    <Palette size={13} />

                                    Note Color

                                </label>

                                <div className="grid grid-cols-7 items-center gap-2">

                                    {COLORS.map(color => (

                                        <button
                                            key={color}
                                            title={color}
                                            onClick={() => updateField('color', color)}
                                            style={{ backgroundColor: color, }}
                                            className={`flex h-8 w-8 items-center justify-center rounded-full border transition hover:scale-110 ${note.color === color
                                                ? 'border-blue-600 ring-2 ring-blue-200 ring-offset-2'
                                                : 'border-slate-300'
                                                }`}
                                        >

                                            {note.color === color && (<Check size={14} className="text-slate-800" />)}

                                        </button>

                                    ))}

                                </div>

                            </div>

                        </div>

                    </div>

                    {/* ERROR */}

                    {error && (
                        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
                    )}

                    {/* BOTTOM INFO */}

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">

                        <div className="flex items-center gap-2">
                            <Info size={14} />
                            Your changes are saved when you click Save Changes.
                        </div>

                        <button
                            onClick={() => navigate('/notes')}
                            className="font-semibold text-slate-500 transition hover:text-blue-600"
                        >
                            Cancel and return
                        </button>

                    </div>

                </div>

            </main>

        </div>

    );

}