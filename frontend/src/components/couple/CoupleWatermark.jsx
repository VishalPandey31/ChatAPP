import React, { useState, useEffect } from 'react';
import './CoupleFeatures.css';

export default function CoupleWatermark({ userName }) {
    const [currentTimeStr, setCurrentTimeStr] = useState('');

    useEffect(() => {
        const updateTime = () => {
            const now = new Date();
            setCurrentTimeStr(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        };
        updateTime();
        const interval = setInterval(updateTime, 30000);
        return () => clearInterval(interval);
    }, []);

    const name = userName || 'SECURE COUPLE';
    const watermarkText = `CONFIDENTIAL • ${name.toUpperCase()} • ${currentTimeStr}`;

    // Generate repeat array to cover full screen
    const repeatArray = Array.from({ length: 24 });

    return (
        <div className="couple-watermark-overlay">
            {repeatArray.map((_, i) => (
                <div key={i} className="couple-watermark-text">
                    {watermarkText}
                </div>
            ))}
        </div>
    );
}
