import React, { useState } from 'react';
import { BookOpen, Users, Send, CheckCheck, Paperclip, ArrowLeft } from 'lucide-react';

export default function DecoyChatModal({ isOpen = true, onClose, onExit }) {
    const [messages, setMessages] = useState([
        { id: 1, sender: 'Prof. Sharma', text: 'Reminder: Lab Report 4 on Binary Search Trees is due tomorrow at 11:59 PM.', time: '10:15 AM' },
        { id: 2, sender: 'Rahul Verma', text: 'Anyone finished question 3 on Red-Black Trees balancing?', time: '10:32 AM' },
        { id: 3, sender: 'Anjali Gupta', text: 'Yes, remember to do left rotation first then recolor the parent node.', time: '10:45 AM' },
        { id: 4, sender: 'You', text: 'Understood, thanks Anjali. Working on the time complexity analysis now.', time: '11:02 AM' },
        { id: 5, sender: 'Kunal Shah', text: 'Lecture notes for Module 5 have been uploaded to Moodle portal.', time: '11:15 AM' }
    ]);
    const [inputText, setInputText] = useState('');

    if (isOpen === false) return null;

    const handleSend = (e) => {
        e.preventDefault();
        if (!inputText.trim()) return;

        const newMsg = {
            id: Date.now(),
            sender: 'You',
            text: inputText.trim(),
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages(prev => [...prev, newMsg]);
        setInputText('');

        // Simulated innocent auto-reply after 1.5s
        setTimeout(() => {
            setMessages(prev => [
                ...prev,
                {
                    id: Date.now() + 1,
                    sender: 'Rahul Verma',
                    text: 'Noted! We can discuss this in tomorrow’s lab session.',
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                }
            ]);
        }, 1500);
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999999, backgroundColor: '#0f172a', display: 'flex', flexDirection: 'column', fontFamily: 'Inter, sans-serif' }}>
            {/* Header */}
            <div style={{ padding: '14px 20px', backgroundColor: '#1e293b', borderBottom: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button
                        onClick={onExit || onClose}
                        title="Exit"
                        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff' }}>
                        <BookOpen size={20} />
                    </div>
                    <div>
                        <h3 style={{ margin: 0, fontSize: 16, color: '#f8fafc', fontWeight: 600 }}>CS402: Algorithms Study Group</h3>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>5 members • Online</span>
                    </div>
                </div>
                <div style={{ color: '#64748b', fontSize: 12 }}>Academic Vault</div>
            </div>

            {/* Messages Area */}
            <div style={{ flex: 1, padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ alignSelf: 'center', background: 'rgba(30, 41, 59, 0.8)', padding: '6px 14px', borderRadius: 20, fontSize: 12, color: '#94a3b8' }}>
                    Today
                </div>

                {messages.map(m => {
                    const isMe = m.sender === 'You';
                    return (
                        <div
                            key={m.id}
                            style={{
                                alignSelf: isMe ? 'flex-end' : 'flex-start',
                                maxWidth: '75%',
                                backgroundColor: isMe ? '#1d4ed8' : '#1e293b',
                                color: '#f8fafc',
                                padding: '10px 14px',
                                borderRadius: 12,
                                borderBottomRightRadius: isMe ? 2 : 12,
                                borderBottomLeftRadius: isMe ? 12 : 2,
                                boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                            }}
                        >
                            {!isMe && (
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#60a5fa', marginBottom: 4 }}>
                                    {m.sender}
                                </div>
                            )}
                            <div style={{ fontSize: 14, lineHeight: 1.4 }}>{m.text}</div>
                            <div style={{ fontSize: 10, color: '#93c5fd', textAlign: 'right', marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                                <span>{m.time}</span>
                                {isMe && <CheckCheck size={12} />}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Input Bar */}
            <form onSubmit={handleSend} style={{ padding: '14px 20px', backgroundColor: '#1e293b', borderTop: '1px solid #334155', display: 'flex', gap: 10, alignItems: 'center' }}>
                <button type="button" style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                    <Paperclip size={20} />
                </button>
                <input
                    type="text"
                    placeholder="Type an assignment question or note..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    style={{
                        flex: 1,
                        backgroundColor: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: 24,
                        padding: '10px 18px',
                        color: '#f8fafc',
                        fontSize: 14,
                        outline: 'none'
                    }}
                />
                <button
                    type="submit"
                    style={{
                        backgroundColor: '#2563eb',
                        border: 'none',
                        borderRadius: '50%',
                        width: 42,
                        height: 42,
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer'
                    }}
                >
                    <Send size={18} />
                </button>
            </form>
        </div>
    );
}
