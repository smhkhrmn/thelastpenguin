"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Signal, ChevronLeft, RefreshCw, Anchor, MapPin, 
    Radio, Bell, History, Globe, Ship, Activity, ExternalLink, MessageSquare, Edit3 
} from "lucide-react";
import LavaBackground from '@/components/LavaBackground';
import ProfileSetup from '@/components/ProfileSetup';

// --- SCRAMBLE TEXT BİLEŞENİ (YENİ EKLENDİ) ---
// Bu bileşen metni alır ve "hack/decode" efektiyle gösterir.
const ScrambleText = ({ text, className }: { text: string, className?: string }) => {
    const [displayText, setDisplayText] = useState(text);
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$%^&*()_+~|}{[]:;?><,./-=";
    const intervalRef = useRef<any>(null);

    const scramble = () => {
        let iteration = 0;
        clearInterval(intervalRef.current);

        intervalRef.current = setInterval(() => {
            setDisplayText(prev => 
                text
                .split("")
                .map((letter, index) => {
                    if (index < iteration) {
                        return text[index];
                    }
                    return chars[Math.floor(Math.random() * chars.length)];
                })
                .join("")
            );

            if (iteration >= text.length) {
                clearInterval(intervalRef.current);
            }

            iteration += 1 / 2; // Hız ayarı (Düşük sayı = Daha yavaş)
        }, 30);
    };

    // Metin değiştiğinde (sayfa yüklendiğinde) çalıştır
    useEffect(() => {
        scramble();
        return () => clearInterval(intervalRef.current);
    }, [text]);

    return (
        <span className={className} onMouseEnter={scramble} style={{ cursor: 'default' }}>
            {displayText}
        </span>
    );
};

export default function ProfilePage() {
    const params = useParams();
    const router = useRouter();
    const usernameParam = decodeURIComponent(params.username as string);
    
    // -- State Yönetimi --
    const [userSignals, setUserSignals] = useState<any[]>([]);
    const [allReceivedLikes, setAllReceivedLikes] = useState<any[]>([]);
    const [profileData, setProfileData] = useState<any>(null);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [activeTab, setActiveTab] = useState<'broadcasts' | 'notifications'>('broadcasts');

    // -- Veri Çekme Fonksiyonu --
    const fetchUserData = async () => {
        setIsLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            setCurrentUser(user);

            const { data: profile } = await supabase.from('profiles').select('*').ilike('username', usernameParam).single();
            
            if (profile) {
                setProfileData(profile);
                
                const { data: signals } = await supabase
                    .from('signals')
                    .select('*, comments(*)')
                    .eq('author', profile.username)
                    .order('created_at', { ascending: false });
                
                setUserSignals(signals || []);

                if (signals && signals.length > 0) {
                    const signalIds = signals.map(s => s.id);
                    const { data: likes } = await supabase
                        .from('likes')
                        .select('*')
                        .in('signal_id', signalIds)
                        .order('created_at', { ascending: false });

                    if (likes) {
                        const enrichedLikes = await Promise.all(likes.map(async (like) => {
                            const { data: sender } = await supabase
                                .from('profiles')
                                .select('username, country, avatar_url')
                                .eq('id', like.user_id)
                                .single();
                            
                            const msg = signals.find(s => s.id === like.signal_id);
                            return { 
                                ...like, 
                                sender_name: sender?.username || 'Explorer', 
                                sender_country: sender?.country || 'Void',
                                sender_avatar: sender?.avatar_url, 
                                signal_text: msg?.content 
                            };
                        }));
                        setAllReceivedLikes(enrichedLikes);
                    }
                }
            }
        } catch (err) {
            console.error("Veri çekme hatası:", err);
        } finally { 
            setIsLoading(false); 
        }
    };

    useEffect(() => {
        fetchUserData();
    }, [usernameParam]);

    const totalResonances = userSignals.reduce((acc, curr) => acc + (curr.comments?.length || 0), 0);
    const isOwnProfile = currentUser && profileData && currentUser.id === profileData.id;

    return (
        <div className="relative min-h-screen w-full bg-[#030303] text-zinc-100 font-sans selection:bg-blue-500/40 overflow-x-hidden">
            <LavaBackground />
            <div className="fixed inset-0 bg-gradient-to-b from-black/20 via-black/80 to-black z-0" />

            {/* DÜZENLEME MODALI */}
            {isEditing && (
                <ProfileSetup 
                    userId={currentUser.id} 
                    initialData={profileData} 
                    isEditing={true} 
                    onComplete={() => { setIsEditing(false); fetchUserData(); }} 
                />
            )}

            {/* ÜST NAVİGASYON */}
            <nav className="fixed top-0 left-0 right-0 z-50 p-6 md:p-10 flex justify-between items-center">
                <button onClick={() => router.push('/')} className="group flex items-center gap-3 bg-white/5 hover:bg-white/10 backdrop-blur-2xl px-5 py-2.5 rounded-2xl border border-white/10 transition-all active:scale-95">
                    <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400 group-hover:text-white">Back to Scanner</span>
                </button>

                {isOwnProfile && (
                    <button 
                        onClick={() => setIsEditing(true)}
                        className="flex items-center gap-2 bg-blue-500/10 hover:bg-blue-500/30 text-blue-400 px-5 py-2.5 rounded-2xl border border-blue-500/30 transition-all text-[10px] font-bold uppercase tracking-widest hover:scale-105"
                    >
                        <Edit3 className="w-3.5 h-3.5" /> Modify Profile
                    </button>
                )}
            </nav>

            <main className="relative z-10 flex flex-col items-center pt-32 pb-32 px-4 max-w-5xl mx-auto">
                
                {/* PROFIL KOKPİTİ */}
                <div className="w-full flex flex-col items-center mb-16">
                    <div className="relative group mb-8">
                        <div className="absolute inset-0 bg-blue-500 rounded-full blur-[60px] opacity-20" />
                        <div className="relative w-32 h-32 md:w-40 md:h-40 rounded-[3.5rem] p-1 bg-gradient-to-br from-white/20 to-transparent shadow-2xl">
                            <div className="w-full h-full rounded-[3.3rem] bg-[#080808] overflow-hidden border border-white/5">
                                <img 
                                    src={profileData?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${usernameParam}`} 
                                    className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-700"
                                    alt="Avatar"
                                />
                            </div>
                        </div>
                        <div className={`absolute -bottom-1 -right-1 w-7 h-7 rounded-full border-[6px] border-[#030303] shadow-xl transition-all ${profileData?.current_status === 'S.O.S' ? 'bg-red-500 animate-pulse shadow-red-500/50' : 'bg-green-500'}`} />
                    </div>

                    {/* YENİ: SCRAMBLE EFFECT UYGULANMIŞ İSİM */}
                    <h2 className="text-5xl md:text-6xl font-bold tracking-tighter mb-2 text-white italic">
                        <ScrambleText 
                            text={profileData?.username || usernameParam} 
                            className="font-mono" // Font-mono, hacker hissini artırır
                        />
                    </h2>

                    <div className="flex flex-col items-center gap-2 mb-10">
                        <div className="flex items-center gap-2 text-blue-400 font-black text-[10px] uppercase tracking-[0.4em]">
                            <Ship className="w-3 h-3" /> Vessel: {profileData?.vessel_name || 'Unidentified'}
                        </div>
                        <div className="text-zinc-500 italic text-xs opacity-70">
                            "{profileData?.current_status || 'Drifting in the void'}"
                        </div>
                        {profileData?.bio && (
                            <p className="text-zinc-400 text-sm max-w-md text-center mt-2 px-4 leading-relaxed">
                                {profileData.bio}
                            </p>
                        )}
                    </div>

                    {/* İSTATİSTİK DASHBOARD */}
                    <div className="grid grid-cols-3 gap-4 md:gap-12 border-y border-white/5 py-8 w-full max-w-2xl mb-12 bg-white/[0.02] rounded-3xl">
                        <div className="text-center">
                            <div className="text-2xl font-mono font-bold text-white">{userSignals.length}</div>
                            <div className="text-[8px] uppercase tracking-[0.3em] text-zinc-500 mt-1">Broadcasts</div>
                        </div>
                        <div className="text-center border-x border-white/5">
                            <div className="text-2xl font-mono font-bold text-blue-500">{allReceivedLikes.length}</div>
                            <div className="text-[8px] uppercase tracking-[0.3em] text-zinc-500 mt-1">Echoes</div>
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-mono font-bold text-white">{totalResonances}</div>
                            <div className="text-[8px] uppercase tracking-[0.3em] text-zinc-500 mt-1">Resonances</div>
                        </div>
                    </div>

                    <div className="flex flex-wrap justify-center gap-4 mb-12">
                        <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-xl border border-white/10 text-zinc-400">
                            <MapPin className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase tracking-widest">{profileData?.country || 'Void'}</span>
                        </div>
                        {profileData?.external_link && (
                            <a 
                                href={profileData.external_link} 
                                target="_blank" 
                                className="flex items-center gap-2 bg-blue-500/10 hover:bg-blue-500/20 px-4 py-2 rounded-xl border border-blue-500/20 text-blue-400 transition-all hover:scale-105"
                            >
                                <ExternalLink className="w-4 h-4" />
                                <span className="text-xs font-bold uppercase tracking-widest">External Frequency</span>
                            </a>
                        )}
                    </div>

                    {/* SEKME SEÇİCİ */}
                    <div className="flex bg-white/5 p-1.5 rounded-2xl border border-white/5 backdrop-blur-xl">
                        <button onClick={() => setActiveTab('broadcasts')} className={`px-8 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === 'broadcasts' ? 'bg-white text-black shadow-xl' : 'text-zinc-500 hover:text-white'}`}>Transmissions</button>
                        <button onClick={() => setActiveTab('notifications')} className={`px-8 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === 'notifications' ? 'bg-white text-black shadow-xl' : 'text-zinc-500 hover:text-white'}`}>Signal Log</button>
                    </div>
                </div>

                {/* İÇERİK LİSTESİ */}
                <div className="w-full max-w-3xl">
                    <AnimatePresence mode="wait">
                        {isLoading ? (
                            <div className="flex flex-col items-center py-24 gap-4"><RefreshCw className="w-8 h-8 animate-spin text-blue-500" /></div>
                        ) : activeTab === 'broadcasts' ? (
                            <motion.div key="broadcasts" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="grid gap-8">
                                {userSignals.length > 0 ? userSignals.map(signal => (
                                    <div key={signal.id} className="group relative bg-gradient-to-b from-white/[0.05] to-transparent border border-white/10 rounded-[2.5rem] p-10 backdrop-blur-md hover:border-white/20 transition-all">
                                        <div className="flex justify-between items-start mb-6 opacity-40">
                                            <span className="text-[10px] font-bold uppercase tracking-[0.3em]">{signal.frequency}</span>
                                            <span className="text-[10px] font-mono">{new Date(signal.created_at).toLocaleDateString()}</span>
                                        </div>
                                        <p className="text-2xl md:text-3xl font-serif italic text-zinc-100 leading-snug mb-8">"{signal.content}"</p>
                                        <div className="flex gap-6 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                                            <div className="flex items-center gap-2"><MessageSquare className="w-4 h-4" /> {signal.comments?.length || 0} Responses</div>
                                            <div className="flex items-center gap-2"><Radio className="w-4 h-4" /> {signal.likes?.length || 0} Echoes</div>
                                        </div>
                                    </div>
                                )) : <div className="text-center opacity-30 italic py-20">No transmissions recorded yet.</div>}
                            </motion.div>
                        ) : (
                            <motion.div key="notifications" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="grid gap-4">
                                {allReceivedLikes.length > 0 ? allReceivedLikes.map(like => (
                                    <div key={like.id} className="bg-white/5 border border-white/5 rounded-3xl p-6 flex items-center justify-between group hover:bg-blue-500/5 transition-all">
                                        <div className="flex items-center gap-5">
                                            <div className="w-12 h-12 rounded-2xl overflow-hidden bg-zinc-800 border border-white/10">
                                                <img src={like.sender_avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${like.sender_name}`} className="w-full h-full object-cover" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium">
                                                    <span className="text-white font-bold">@{like.sender_name}</span> 
                                                    <span className="text-zinc-500 mx-2">from</span> 
                                                    <span className="text-blue-400 font-bold uppercase tracking-tighter">{like.sender_country}</span>
                                                </p>
                                                <p className="text-[10px] text-zinc-600 italic mt-1 line-clamp-1">Target: "{like.signal_text}"</p>
                                            </div>
                                        </div>
                                        <Radio className="w-5 h-5 text-blue-500" />
                                    </div>
                                )) : <div className="text-center opacity-30 italic py-20">Signal log is empty.</div>}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </main>
        </div>
    );
}