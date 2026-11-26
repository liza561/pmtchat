
import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import UserAvatar from './UserAvatar';
import Profile from './Profile';

const Icon = ({ name, size = 21 }) => {
    const common = {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
    };

    const icons = {
        chat: (
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        ),
        videocam: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="6" width="13" height="12" rx="2" />
                <path d="m16 10 5-3v10l-5-3z" />
            </svg>
        ),
        notes: (
            <>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6M8 13h8m-8 4h8" />
            </>
        ),
        settings: (
            <>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </>
        ),
    };

    return <svg {...common}>{icons[name]}</svg>;
};

export default function Aside() {
    const { localUser, peers, unreadCounts } = useAppContext();
    const [showProfile, setShowProfile] = useState(false);

    const totalUnread = Object.values(unreadCounts || {}).reduce(
        (total, count) => total + (Number(count) || 0),
        0
    );

    const onlineCount = (peers || []).length;
    const navigation = [
        { path: '/chat', icon: 'chat', label: 'Chat' },
        { path: '/meetings', icon: 'videocam', label: 'Meet' },
        { path: '/notes', icon: 'notes', label: 'Notes' },
        { path: '/settings', icon: 'settings', label: 'Settings' },
    ];

    return (
        <>
            <aside className="flex h-full w-18 shrink-0 flex-col items-center border-r border-slate-200 bg-white py-2">
                <div className="mb-3 flex h-12 w-12 shrink-0 items-center justify-center">
                    <img src="icon.png"
                        alt="Pingo"
                        className="h-8 w-8 object-contain"
                    />
                </div>

                {/* Navigation */}
                <nav className="flex flex-1 flex-col items-center gap-4">

                    {navigation.map((item) => (
                        <NavLink key={item.path}
                            to={item.path}
                            title={item.label}
                            aria-label={item.label}
                            className={({ isActive }) =>
                                `group relative flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200 ${isActive
                                    ? 'bg-blue-900 text-white shadow-md'
                                    : 'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-blue-600'
                                }`
                            }
                        >
                            <Icon name={item.icon} size={21} />

                            {/* Unread Badge */}
                            {item.path === '/chat' && totalUnread > 0 && (
                                <span className="absolute right-1 top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full border-2 border-white bg-red-500 px-1 text-[10px] font-bold text-white">
                                    {totalUnread > 99 ? '99+' : totalUnread}
                                </span>
                            )}
                        </NavLink>
                    ))}

                </nav>

                {/* Profile */}
                <div className="mt-auto flex w-full items-center justify-center pt-3">
                    <button
                        type="button"
                        title="Your Profile"
                        aria-label="Open profile"
                        onClick={() => setShowProfile(true)}
                        className="group relative flex h-11 w-11 items-center justify-center rounded-full transition-all hover:bg-slate-100"
                    >
                        <div className="h-9 w-9 overflow-hidden rounded-full border border-slate-200 shadow-sm">
                            <UserAvatar
                                name={localUser?.username}
                                size={38}
                                avatarUrl={localUser?.avatar_path}
                            />
                        </div>

                        {/* Online indicator */}
                        <span className="absolute bottom-0.75 right-0.75 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
                    </button>
                </div>
            </aside>

            {/* Profile Modal */}
            {showProfile && (
                <Profile
                    isOpen={showProfile}
                    onClose={() => setShowProfile(false)}
                />
            )}
        </>
    );
}

