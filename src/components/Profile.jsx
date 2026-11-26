import React, { useState, useRef, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import UserAvatar from './UserAvatar';

export default function Profile({ isOpen, onClose, peer }) {
    const { localUser, updateProfile, saveAvatar } = useAppContext();
    const [editing, setEditing] = useState(false);
    const [username, setUsername] = useState('');
    const [bio, setBio] = useState('');
    const [designation, setDesignation] = useState('');
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileRef = useRef(null);
    const user = peer || localUser;
    const isLocal = !peer;
    const startEdit = () => {
        setUsername(localUser?.username || '');
        setBio(localUser?.bio || '');
        setDesignation(localUser?.designation || '');
        setEditing(true);
    };

    const handleSave = async () => {
        if (!username.trim()) return;

        try {
            setSaving(true);

            await updateProfile({
                username: username.trim(),
                bio: bio.trim(),
                designation: designation.trim(),
            });

            setEditing(false);
        } catch (error) {
            console.error('Failed to update profile:', error);
        } finally {
            setSaving(false);
        }
    };

    const handleAvatarChange = useCallback(async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            e.target.value = '';
            return;
        }

        try {
            setUploading(true);

            const reader = new FileReader();

            reader.onload = async (event) => {
                try {
                    await saveAvatar(event.target.result);
                } catch (error) {
                    console.error('Failed to save avatar:', error);
                } finally {
                    setUploading(false);
                    e.target.value = '';
                }
            };

            reader.onerror = () => {
                console.error('Failed to read image');
                setUploading(false);
                e.target.value = '';
            };

            reader.readAsDataURL(file);
        } catch (error) {
            console.error('Avatar upload failed:', error);
            setUploading(false);
        }
    }, [saveAvatar]);

    if (!isOpen || !user) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"
            onClick={onClose}
        >
            <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                    <div><h2 className="text-lg font-semibold text-slate-800"> {isLocal ? 'My Profile' : 'Profile'}</h2></div>

                    <button type="button"
                        onClick={onClose}
                        aria-label="Close profile"
                        className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    >
                        <svg width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                        >
                            <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-2">
                    <div className="mb-3 flex flex-col items-center">
                        <div className="relative">
                            <div className="overflow-hidden rounded-full ring-4 ring-sky-50">
                                <UserAvatar name={user.username} size={68} avatarUrl={user.avatar_path} />
                            </div>
                            <span className="absolute bottom-1 right-1 h-4 w-4 rounded-full border-[3px] border-white bg-emerald-500" />
                        </div>

                        <h3 className="mt-3 text-lg font-semibold text-slate-800"> {user.username} </h3>

                        {user.designation && !editing && (<p className="mt-1 text-sm text-slate-500"> {user.designation} </p>)}

                        {isLocal && (
                            <>
                                <button type="button"
                                    onClick={() => fileRef.current?.click()}
                                    disabled={uploading}
                                    className="mt-3 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {uploading ? 'Uploading...' : 'Change Photo'}
                                </button>

                                <input ref={fileRef}
                                    type="file"
                                    accept="image/*"
                                    hidden
                                    onChange={handleAvatarChange}
                                />
                            </>
                        )}
                    </div>

                    {/* Edit Form */}
                    {editing ? (
                        <div className="space-y-4">
                            <div>
                                <label className="mb-1.5 block text-sm font-medium text-slate-600"> Name </label>
                                <input value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    maxLength={30}
                                    autoFocus
                                    placeholder="Your name"
                                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                                />
                            </div>

                            <div>
                                <label className="flex justify-between mb-1.5 block text-sm font-medium text-slate-600"> Bio
                                    <span className="mt-1 text-right text-xs text-slate-400"> {bio.length}/200</span>
                                </label>
                                <textarea
                                    value={bio}
                                    onChange={(e) => setBio(e.target.value)}
                                    rows={3}
                                    maxLength={200}
                                    placeholder="Tell something about yourself..."
                                    className="w-full resize-none rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                                />
                            </div>

                            <div className="mt-0">
                                <label className="mb-1.5 block text-sm font-medium text-slate-600"> Designation</label>
                                <input value={designation}
                                    onChange={(e) => setDesignation(e.target.value)}
                                    maxLength={50}
                                    placeholder="Your role or designation"
                                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                                />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button type="button"
                                    onClick={() => setEditing(false)}
                                    disabled={saving}
                                    className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                                >
                                    Cancel
                                </button>

                                <button
                                    type="button"
                                    onClick={handleSave}
                                    disabled={!username.trim() || saving}
                                    className="flex-1 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {saving ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* Profile Information */
                        <div className="space-y-3">
                            <div className="rounded-xl bg-slate-50 p-2">
                                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Name</p>
                                <p className="text-sm font-medium text-slate-700">{user.username || 'Not provided'}</p>
                            </div>

                            <div className="rounded-xl bg-slate-50 p-2">
                                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Bio</p>
                                <p className="whitespace-pre-wrap text-sm text-slate-700">{user.bio || 'No bio added yet'}</p>
                            </div>

                            <div className="rounded-xl bg-slate-50 p-2">
                                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400"> Designation</p>
                                <p className="text-sm text-slate-700"> {user.designation || 'Not provided'} </p>
                            </div>

                            {user.device_id && (
                                <div className="rounded-xl bg-slate-50 p-2">
                                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Device ID</p>
                                    <p className="break-all font-mono text-xs text-slate-600">{user.device_id}</p>
                                </div>
                            )}

                            {isLocal && (
                                <button type="button"
                                    onClick={startEdit}
                                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-600"
                                >
                                    <svg width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <path d="M12 20h9" />
                                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" />
                                    </svg>
                                    Edit Profile
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}