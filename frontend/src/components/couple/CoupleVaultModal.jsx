import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Heart, Plus, Trash2, X, Lock } from 'lucide-react';
import './CoupleFeatures.css';

export default function CoupleVaultModal({ isOpen = true, onClose, partnerName }) {
    const [targetDateStr, setTargetDateStr] = useState(() => {
        return localStorage.getItem('couple_target_date') || '2026-12-31T00:00';
    });
    const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
    const [notes, setNotes] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('couple_secret_notes') || '[]');
        } catch {
            return [];
        }
    });
    const [newNote, setNewNote] = useState('');

    useEffect(() => {
        const calculateTime = () => {
            const difference = +new Date(targetDateStr) - +new Date();
            if (difference > 0) {
                setTimeLeft({
                    days: Math.floor(difference / (1000 * 60 * 60 * 24)),
                    hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
                    minutes: Math.floor((difference / 1000 / 60) % 60),
                    seconds: Math.floor((difference / 1000) % 60)
                });
            } else {
                setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
            }
        };

        calculateTime();
        const interval = setInterval(calculateTime, 1000);
        return () => clearInterval(interval);
    }, [targetDateStr]);

    if (isOpen === false) return null;

    const handleSaveDate = (e) => {
        const val = e.target.value;
        setTargetDateStr(val);
        localStorage.setItem('couple_target_date', val);
    };

    const handleAddNote = (e) => {
        e.preventDefault();
        if (!newNote.trim()) return;
        const updated = [{ id: Date.now(), text: newNote.trim(), date: new Date().toLocaleDateString() }, ...notes];
        setNotes(updated);
        localStorage.setItem('couple_secret_notes', JSON.stringify(updated));
        setNewNote('');
    };

    const handleDeleteNote = (id) => {
        const updated = notes.filter(n => n.id !== id);
        setNotes(updated);
        localStorage.setItem('couple_secret_notes', JSON.stringify(updated));
    };

    return (
        <div className="watch-together-overlay">
            <div className="watch-together-card" style={{ maxWidth: 560, backgroundColor: '#0f172a' }}>
                {/* Header */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Heart size={22} color="#ec4899" fill="#ec4899" />
                        <div>
                            <h3 style={{ margin: 0, color: '#f8fafc', fontSize: 16, fontWeight: 700 }}>
                                Secret Couple Vault & Memories
                            </h3>
                            <span style={{ fontSize: 12, color: '#94a3b8' }}>
                                Private memories with {partnerName || 'Partner'}
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 6 }}
                    >
                        <X size={20} />
                    </button>
                </div>

                <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* Countdown Banner */}
                    <div style={{ background: 'radial-gradient(circle at top, #3b0764 0%, #0f172a 100%)', border: '1px solid #6b21a8', borderRadius: 14, padding: '18px 20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#e9d5ff', fontWeight: 600, fontSize: 14 }}>
                                <Clock size={16} color="#c084fc" />
                                <span>Next Special Meetup / Anniversary</span>
                            </div>
                            <input
                                type="datetime-local"
                                value={targetDateStr}
                                onChange={handleSaveDate}
                                style={{ backgroundColor: '#1e1b4b', border: '1px solid #4c1d95', borderRadius: 6, color: '#e9d5ff', fontSize: 12, padding: '4px 8px', outline: 'none' }}
                            />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, textAlign: 'center' }}>
                            <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 10, padding: 10 }}>
                                <div style={{ fontSize: 26, fontWeight: 800, color: '#f472b6' }}>{timeLeft.days}</div>
                                <div style={{ fontSize: 11, color: '#cbd5e1', textTransform: 'uppercase' }}>Days</div>
                            </div>
                            <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 10, padding: 10 }}>
                                <div style={{ fontSize: 26, fontWeight: 800, color: '#f472b6' }}>{timeLeft.hours}</div>
                                <div style={{ fontSize: 11, color: '#cbd5e1', textTransform: 'uppercase' }}>Hours</div>
                            </div>
                            <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 10, padding: 10 }}>
                                <div style={{ fontSize: 26, fontWeight: 800, color: '#f472b6' }}>{timeLeft.minutes}</div>
                                <div style={{ fontSize: 11, color: '#cbd5e1', textTransform: 'uppercase' }}>Mins</div>
                            </div>
                            <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 10, padding: 10 }}>
                                <div style={{ fontSize: 26, fontWeight: 800, color: '#f472b6' }}>{timeLeft.seconds}</div>
                                <div style={{ fontSize: 11, color: '#cbd5e1', textTransform: 'uppercase' }}>Secs</div>
                            </div>
                        </div>
                    </div>

                    {/* Secret Notes / Scrapbook */}
                    <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#f8fafc', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Lock size={15} color="#ec4899" />
                            <span>Private Couple Love Notes & Promises</span>
                        </div>

                        <form onSubmit={handleAddNote} style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                            <input
                                type="text"
                                placeholder="Add a sweet secret note or special promise..."
                                value={newNote}
                                onChange={(e) => setNewNote(e.target.value)}
                                style={{ flex: 1, backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '10px 14px', color: '#f8fafc', fontSize: 13, outline: 'none' }}
                            />
                            <button
                                type="submit"
                                style={{ backgroundColor: '#db2777', color: '#ffffff', border: 'none', borderRadius: 8, padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600, fontSize: 13 }}
                            >
                                <Plus size={16} /> Add
                            </button>
                        </form>

                        <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {notes.length === 0 ? (
                                <div style={{ color: '#64748b', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>
                                    No notes yet. Add your first memory or anniversary promise! ❤️
                                </div>
                            ) : (
                                notes.map(n => (
                                    <div key={n.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1e293b', padding: '10px 14px', borderRadius: 8, border: '1px solid #334155' }}>
                                        <div>
                                            <div style={{ color: '#f1f5f9', fontSize: 13 }}>{n.text}</div>
                                            <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>{n.date}</div>
                                        </div>
                                        <button
                                            onClick={() => handleDeleteNote(n.id)}
                                            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
                                            title="Delete note"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
