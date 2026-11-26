import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotes } from '../context/AppContext';
import { Search, Plus, Pin, FileText, StickyNote, Clock3, ArrowUpRight, LayoutGrid, Trash2, } from 'lucide-react';

export default function NotesPage() {
    const navigate = useNavigate();
    const { notes, loading, togglePin, remove } = useNotes();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedFilter, setSelectedFilter] = useState('all');

    const categories = useMemo(() => {
        return [
            'all',
            'pinned',
            ...new Set(
                notes
                    .map(note => note.category?.trim())
                    .filter(Boolean)
            ),
        ];
    }, [notes]);

    const filteredNotes = useMemo(() => {
        let result = [...notes];

        if (selectedFilter === 'pinned') {
            result = result.filter(note => note.pinned);
        } else if (selectedFilter !== 'all') {
            result = result.filter(
                note => note.category === selectedFilter
            );
        }

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();

            result = result.filter(note =>
                (note.title || '').toLowerCase().includes(query) ||
                (note.content || '').toLowerCase().includes(query) ||
                (note.category || '').toLowerCase().includes(query)
            );
        }

        return result.sort(
            (a, b) => Number(b.pinned) - Number(a.pinned)
        );
    }, [notes, selectedFilter, searchQuery]);

    const formatDate = (date) => {
        if (!date) return '';

        const parsed = new Date(date);

        if (Number.isNaN(parsed.getTime())) return '';

        return parsed.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        });
    };

    const handleDelete = async (e, note) => {
        e.stopPropagation();

        await remove(note.id);
    };

    const handlePin = async (e, note) => {
        e.stopPropagation();

        await togglePin(note.id);
    };

    return (
        <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#f8f9fc]">

            {/* HEADER */}
            <header className="shrink-0 border-b border-slate-200/70 bg-white">

                <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-5 py-6 sm:px-8 lg:px-12">

                    <div className="flex flex-col gap-5 border-b border-slate-200/70 pb-6 sm:flex-row sm:items-center sm:justify-between">

                        {/* LEFT — PAGE TITLE */}
                        <div className="min-w-0">
                            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"> My Notes </h1>
                        </div>

                        {/* RIGHT — SEARCH + CREATE */}
                        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">

                            {/* SEARCH */}
                            <div className="group flex h-11 w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 shadow-sm transition-all duration-200 hover:border-slate-300 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-500/10 sm:w-72">

                                <Search
                                    size={18}
                                    className="shrink-0 text-slate-400 transition-colors group-focus-within:text-blue-600"
                                />

                                <input
                                    type="text"
                                    placeholder="Search your notes..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                                />

                            </div>

                            {/* NEW NOTE */}
                            <button
                                type="button"
                                onClick={() => navigate('/notes/new')}
                                className="group inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white shadow-md shadow-blue-600/20 transition-all duration-200 hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-600/25 active:translate-y-0 active:scale-[0.98]"
                            >
                                <Plus
                                    size={18}
                                    strokeWidth={2.5}
                                    className="transition-transform duration-200 group-hover:rotate-90"
                                />
                                New Note
                            </button>

                        </div>

                    </div>

                    {/* FILTERS */}
                    <div className="flex items-center gap-2 overflow-x-auto">

                        {categories.map(category => {

                            const active = selectedFilter === category;

                            return (
                                <button
                                    key={category}
                                    onClick={() => setSelectedFilter(category)}
                                    className={`shrink-0 rounded-lg px-2 py-2 text-xs font-semibold capitalize transition ${active
                                        ? 'bg-blue-600 text-white shadow-md shadow-blue-600/15'
                                        : 'border border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600'
                                        }`}
                                >
                                    {category === 'all'
                                        ? 'All Notes'
                                        : category === 'pinned'
                                            ? 'Pinned'
                                            : category}
                                </button>
                            );
                        })}

                    </div>

                </div>

            </header>

            {/* NOTES CONTENT */}
            <main className="flex-1 overflow-y-auto bg-white">

                <div className="mx-auto w-full max-w-[1600px] px-5 py-7 sm:px-8 lg:px-12">

                    {loading ? (

                        <div className="flex min-h-64 items-center justify-center">
                            <div className="flex items-center gap-3 text-sm text-slate-500">
                                <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
                                Loading your notes...
                            </div>
                        </div>

                    ) : filteredNotes.length === 0 ? (

                        /* EMPTY STATE */

                        <div className="flex min-h-[400px] flex-col items-center justify-center text-center">

                            <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-blue-50">
                                <FileText size={34} strokeWidth={1.5} className="text-blue-500" />
                            </div>

                            <h3 className="text-lg font-bold text-slate-800">
                                {searchQuery || selectedFilter !== 'all'
                                    ? 'No matching notes'
                                    : 'Nothing here yet'}
                            </h3>

                            <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
                                {searchQuery || selectedFilter !== 'all'
                                    ? 'Try another search or change your filters.'
                                    : 'Create your first note and keep all your important thoughts in one place.'}
                            </p>
                                             
                            {!searchQuery && selectedFilter === 'all' && (
                                <button
                                    onClick={() => navigate('/notes/new')}
                                    className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
                                >
                                    <Plus size={17} />
                                    Create your first note
                                </button>
                            )}

                        </div>

                    ) : (

                        <>

                            <div className="mb-2 flex items-end justify-end">
                                {/* SEARCH */}
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                    <div className="text-xs font-medium text-slate-400 sm:ml-auto">
                                        {notes.length} {notes.length === 1 ? 'note' : 'notes'}
                                    </div>

                                </div>
                            </div>

                            {/* NOTE CARDS */}

                            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">

                                {filteredNotes.map(note => (

                                    <article
                                        key={note.id}
                                        onClick={() => navigate(`/notes/${note.id}`)}
                                        style={{ backgroundColor: note.color || '#ffffff' }}
                                        className="group relative flex h-[240px] cursor-pointer flex-col overflow-hidden rounded-2xl border border-slate-200/70 p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl hover:shadow-slate-900/[0.06]"
                                    >
                                        {/* TOP */}
                                        <div className="mb-3 flex shrink-0 items-start justify-between gap-3">
                                            <div className="min-w-0 flex-1">
                                                <h3 className="line-clamp-1 break-words text-[16px] font-bold leading-6 tracking-tight text-slate-800">
                                                    {note.title || 'Untitled note'}
                                                </h3>
                                            </div>

                                            <div className="flex shrink-0 items-center gap-1">
                                                <button
                                                    title={note.pinned ? 'Unpin' : 'Pin'}
                                                    onClick={e => handlePin(e, note)}
                                                    className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${note.pinned
                                                            ? 'bg-amber-100 text-amber-600'
                                                            : 'text-slate-400 opacity-0 hover:bg-white/70 hover:text-amber-600 group-hover:opacity-100'
                                                        }`}
                                                >
                                                    <Pin
                                                        size={16}
                                                        className={note.pinned ? 'rotate-[-35deg] fill-current' : ''}
                                                    />
                                                </button>

                                                <button
                                                    title="Delete note"
                                                    onClick={e => handleDelete(e, note)}
                                                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* DESCRIPTION */}
                                        <p className="flex-1 min-h-0 overflow-hidden whitespace-pre-wrap break-words text-[13px] leading-[1.8] text-slate-600/90 line-clamp-4">
                                            {note.content || 'No content yet...'}
                                        </p>

                                        {/* FOOTER */}
                                        <div className="mt-auto flex shrink-0 items-center justify-between gap-2 border-t border-black/[0.07] pt-3">
                                            <div className="min-w-0 flex-1">
                                                {note.category && (
                                                    <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-md border border-black/5 bg-white/50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                                                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                                                        {note.category}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-slate-500">
                                                <Clock3 size={13} />
                                                {formatDate(note.updated_at)}
                                            </div>
                                        </div>
                                    </article>

                                ))}

                            </div>

                        </>

                    )}

                </div>

            </main>

        </div>
    );
}