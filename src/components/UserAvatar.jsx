
import React, { useEffect, useState } from 'react';

const COLORS = [
    '#A5B4FC', // Pastel Indigo
    '#C4B5FD', // Pastel Purple
    '#F9A8D4', // Pastel Pink
    '#FDBA9A', // Pastel Peach
    '#A5D8E8', // Pastel Sky Blue
    '#A7DCC1', // Pastel Mint
    '#F5D69A', // Pastel Yellow
    '#FCA5A5', // Pastel Coral
    '#BFDBFE', // Pastel Blue
    '#DDD6FE', // Lavender
    '#FBCFE8', // Soft Rose
    '#99D5CC', // Pastel Teal
];

function hashCode(str) {
    let hash = 0;

    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }

    return Math.abs(hash);
}

export default function UserAvatar({
    name,
    size = 40,
    className = '',
    style = {},
    avatarUrl
}) {
    const [imageLoaded, setImageLoaded] = useState(false);
    const [imageFailed, setImageFailed] = useState(false);

    useEffect(() => {
        setImageLoaded(false);
        setImageFailed(false);

        if (!avatarUrl) return;

        let mounted = true;

        const img = new Image();

        img.onload = () => {
            if (mounted) setImageLoaded(true);
        };

        img.onerror = () => {
            if (mounted) setImageFailed(true);
        };

        img.src = avatarUrl;

        return () => {
            mounted = false;
            img.onload = null;
            img.onerror = null;
        };
    }, [avatarUrl]);

    const color = COLORS[hashCode(name || '') % COLORS.length];

    const initials = (name || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(word => word[0].toUpperCase())
        .slice(0, 2)
        .join('');

    const fontSize = size * 0.42;

    const avatarStyle = {
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        borderRadius: '50%',
        overflow: 'hidden',
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: color,
        ...style,
    };

    return (
        <div className={className} style={avatarStyle}>
            {avatarUrl && !imageFailed && imageLoaded ? (
                <img
                    src={avatarUrl}
                    alt={name || 'Avatar'}
                    draggable={false}
                    style={{
                        width: '100%',
                        height: '100%',
                        display: 'block',
                        objectFit: 'cover',
                        borderRadius: '50%',
                    }}
                    onError={() => {
                        setImageFailed(true);
                    }}
                />
            ) : initials ? (
                <span
                    style={{
                        color: '#334155',
                        fontSize,
                        fontWeight: 600,
                        fontFamily: 'Outfit, sans-serif',
                        lineHeight: 1,
                        userSelect: 'none',
                    }}
                >
                    {initials}
                </span>
            ) : (
                <svg
                    width="65%"
                    height="65%"
                    viewBox="0 0 40 40"
                    fill="none"
                    aria-hidden="true"
                >
                    <circle cx="20" cy="14" r="7" fill="white" opacity=".9" />
                    <path
                        d="M5 36C5 27 11 23 20 23C29 23 35 27 35 36"
                        fill="white"
                        opacity=".9"
                    />
                </svg>
            )}
        </div>
    );
}

