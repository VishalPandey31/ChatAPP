import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ZoomIn, ZoomOut, RotateCcw, Download } from 'lucide-react';

export const downloadMediaFile = (url, prefix = 'IMG') => {
    try {
        const a = document.createElement('a');
        a.href = url;
        const ext = url.includes('video/mp4') ? 'mp4' : url.includes('image/png') ? 'png' : url.includes('image/webp') ? 'webp' : 'jpg';
        const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
        a.download = `ChatApp_${prefix}_${timestamp}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } catch (err) {
        console.error("Save to gallery failed:", err);
    }
};

const ImageZoomModal = ({ src, onClose }) => {
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef({ x: 0, y: 0 });
    const touchDistRef = useRef(null);

    const handleZoomIn = () => setScale(s => Math.min(s + 0.5, 5));
    const handleZoomOut = () => setScale(s => Math.max(s - 0.5, 0.75));
    const handleReset = () => {
        setScale(1);
        setPosition({ x: 0, y: 0 });
    };

    // Keyboard controls
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
            else if (e.key === '+' || e.key === '=') handleZoomIn();
            else if (e.key === '-' || e.key === '_') handleZoomOut();
            else if (e.key === '0') handleReset();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    // Mouse wheel zoom
    const handleWheel = (e) => {
        e.preventDefault();
        const delta = e.deltaY * -0.002;
        setScale(prev => Math.min(Math.max(prev + delta, 0.75), 5));
    };

    // Mouse Drag/Pan
    const handleMouseDown = (e) => {
        if (scale <= 1) return;
        setIsDragging(true);
        dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    };

    const handleMouseMove = useCallback((e) => {
        if (!isDragging || scale <= 1) return;
        setPosition({
            x: e.clientX - dragStartRef.current.x,
            y: e.clientY - dragStartRef.current.y
        });
    }, [isDragging, scale]);

    const handleMouseUp = () => setIsDragging(false);

    // Touch Pinch & Pan Gestures for Mobile
    const handleTouchStart = (e) => {
        if (e.touches.length === 2) {
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            touchDistRef.current = dist;
        } else if (e.touches.length === 1 && scale > 1) {
            setIsDragging(true);
            dragStartRef.current = {
                x: e.touches[0].clientX - position.x,
                y: e.touches[0].clientY - position.y
            };
        }
    };

    const handleTouchMove = (e) => {
        if (e.touches.length === 2 && touchDistRef.current) {
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            const factor = dist / touchDistRef.current;
            setScale(prev => Math.min(Math.max(prev * factor, 0.75), 5));
            touchDistRef.current = dist;
        } else if (e.touches.length === 1 && isDragging && scale > 1) {
            setPosition({
                x: e.touches[0].clientX - dragStartRef.current.x,
                y: e.touches[0].clientY - dragStartRef.current.y
            });
        }
    };

    const handleTouchEnd = () => {
        touchDistRef.current = null;
        setIsDragging(false);
    };

    // Double tap / double click to toggle 2x zoom
    const handleDoubleClick = () => {
        if (scale > 1) handleReset();
        else {
            setScale(2.5);
            setPosition({ x: 0, y: 0 });
        }
    };

    const modal = (
        <div 
            style={{
                position: 'fixed',
                inset: 0,
                width: '100vw',
                height: '100vh',
                backgroundColor: 'rgba(0, 0, 0, 0.94)',
                zIndex: 100000,
                display: 'flex',
                flexDirection: 'column',
                userSelect: 'none',
                overflow: 'hidden'
            }}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {/* Top Toolbar */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 24px',
                zIndex: 100001,
                background: 'linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, transparent 100%)'
            }}>
                {/* Zoom Info Badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#94A3B8', fontFamily: '"Inter", sans-serif', backgroundColor: '#1E293B', padding: '4px 10px', borderRadius: '12px', border: '1px solid #334155' }}>
                        {Math.round(scale * 100)}% Zoom
                    </span>
                    <span style={{ fontSize: '12px', color: '#64748B', display: 'none' }} className="desktop-hint">
                        Scroll or double-click to zoom
                    </span>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button 
                        onClick={handleZoomIn} 
                        title="Zoom In (+)"
                        style={{ background: '#1E293B', border: '1px solid #334155', color: '#F8FAFC', width: '38px', height: '38px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s' }}
                    >
                        <ZoomIn size={18} />
                    </button>
                    <button 
                        onClick={handleZoomOut} 
                        title="Zoom Out (-)"
                        style={{ background: '#1E293B', border: '1px solid #334155', color: '#F8FAFC', width: '38px', height: '38px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s' }}
                    >
                        <ZoomOut size={18} />
                    </button>
                    <button 
                        onClick={handleReset} 
                        title="Reset Zoom (0)"
                        style={{ background: '#1E293B', border: '1px solid #334155', color: '#F8FAFC', width: '38px', height: '38px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s' }}
                    >
                        <RotateCcw size={16} />
                    </button>
                    
                    {/* Save to Gallery Button */}
                    <button 
                        onClick={() => downloadMediaFile(src, 'PHOTO')} 
                        title="Save to Gallery / Downloads"
                        style={{ background: '#10B981', border: 'none', color: '#FFFFFF', padding: '0 14px', height: '38px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', boxShadow: '0 2px 10px rgba(16, 185, 129, 0.4)' }}
                    >
                        <Download size={16} />
                        Save
                    </button>

                    <button 
                        onClick={onClose} 
                        title="Close (Esc)"
                        style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#EF4444', width: '38px', height: '38px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginLeft: '6px' }}
                    >
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* Main Interactive Zoom Area */}
            <div 
                style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
                    overflow: 'hidden'
                }}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
                onDoubleClick={handleDoubleClick}
            >
                <img 
                    src={src} 
                    alt="Zoom Preview"
                    draggable={false}
                    style={{
                        maxWidth: '92vw',
                        maxHeight: '85vh',
                        objectFit: 'contain',
                        transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                        transition: isDragging ? 'none' : 'transform 0.15s ease-out',
                        willChange: 'transform'
                    }}
                />
            </div>
        </div>
    );

    return createPortal(modal, document.body);
};

export default ImageZoomModal;
