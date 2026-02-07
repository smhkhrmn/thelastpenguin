"use client";

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { 
  MessageSquare, User, CornerDownRight, LogIn, LogOut, Search, Plus, 
  Sparkles, Globe, Briefcase, Radio, Zap, LayoutGrid, Terminal,
  ChevronRight, X, Hash, Activity, Cpu
} from "lucide-react";

import ProfileSetup from '@/components/ProfileSetup';
import { SignalData, MissionData, FREQUENCIES } from "@/types";
import WriteModal from "@/components/modals/WriteModal";

// --- YARDIMCI FONKSİYONLAR ---
const translateText = async (text: string) => {
    if (!text || text.length > 500) return text;
    try {
        const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=Autodetect|en`);
        const data = await response.json();
        return (data.responseStatus !== 200 || data.responseData.translatedText.includes("SELECT TWO DISTINCT LANGUAGES")) ? text : data.responseData.translatedText;
    } catch (error) { return text; }
};

// Renkleri yeni temaya uyarla (Daha parlak, neon renkler)
const getFrequencyColor = (freqId: string) => {
    const colors: {[key: string]: string} = {
        'general': 'text-zinc-400 border-zinc-400',
        'tech': 'text-cyan-400 border-cyan-400',
        'art': 'text-purple-400 border-purple-400',
        'science': 'text-blue-400 border-blue-400',
        'philosophy': 'text-yellow-400 border-yellow-400',
        'music': 'text-pink-400 border-pink-400',
        'business': 'text-emerald-400 border-emerald-400',
    };
    return colors[freqId] || 'text-zinc-400 border-zinc-400';
};

export default function LighthousePage() {
  const router = useRouter();
  
  // STATE
  const [signals, setSignals] = useState<SignalData[]>([]);
  const [dailyQuestion, setDailyQuestion] = useState<any>(null);
  const [dailyResponses, setDailyResponses] = useState<SignalData[]>([]);
  const [missions, setMissions] = useState<MissionData[]>([]);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterFreq, setFilterFreq] = useState("all");
  const [isGlobalEnglish, setIsGlobalEnglish] = useState(false);
  const [translatedIDs, setTranslatedIDs] = useState<{[key: number]: boolean}>({});

  // UI State
  const [isWriting, setIsWriting] = useState(false);
  const [selectedSignal, setSelectedSignal] = useState<SignalData | null>(null);
  const [isMissionModalOpen, setIsMissionModalOpen] = useState(false);
  const [selectedMission, setSelectedMission] = useState<MissionData | null>(null);
  const [isDailyOpen, setIsDailyOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Form State
  const [selectedFreq, setSelectedFreq] = useState(FREQUENCIES[1]);
  const [messageText, setMessageText] = useState("");
  const [commentText, setCommentText] = useState("");
  const [dailyResponseText, setDailyResponseText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [newMission, setNewMission] = useState({ title: '', type: 'partner' as 'partner' | 'paid', description: '', budget: '', contact_email: '', contact_skype: '', contact_insta: '' });
  const [isPostingMission, setIsPostingMission] = useState(false);

  // --- FETCHING & EFFECTS ---
  useEffect(() => {
      // Saat efekti için
      const timer = setInterval(() => setCurrentTime(new Date()), 1000);
      return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const checkUser = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) { setUser(user); fetchProfile(user.id); }
    };
    checkUser();
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        if (currentUser) fetchProfile(currentUser.id);
        else { setProfile(null); setShowSetup(false); }
    });
    return () => { authListener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => { fetchSignals(); }, [filterFreq]);

  // Realtime & Translate (Kısaltılmış)
  useEffect(() => {
      if (isGlobalEnglish && signals.length > 0) {
          const translateMissing = async () => {
              const updatedSignals = await Promise.all(signals.map(async (sig) => {
                  if (!sig.translation) {
                      const translated = await translateText(sig.content);
                      return { ...sig, translation: translated };
                  }
                  return sig;
              }));
              setSignals(updatedSignals);
          };
          translateMissing();
      }
  }, [isGlobalEnglish, signals.length]);

  useEffect(() => {
    const channel = supabase.channel('realtime-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'signals' }, () => { fetchSignals(); if(dailyQuestion && isDailyOpen) fetchDailyResponses(dailyQuestion.id) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'missions' }, () => fetchSignals())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isDailyOpen, dailyQuestion]);

  // --- ACTIONS ---
  const fetchProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (data) { setProfile(data); if (!data.is_setup_complete) setShowSetup(true); }
  };

  const fetchSignals = async () => {
    if (signals.length === 0) setIsLoading(true);
    let query = supabase.from('signals').select('*, comments(*), likes(*)').order('created_at', { ascending: false });
    if (filterFreq !== 'all') query = query.eq('frequency', filterFreq);
    const { data } = await query;

    if (data) {
        const enrichedData = await Promise.all(data.map(async (sig) => {
            const { data: p } = await supabase.from('profiles').select('avatar_url, country, occupation').eq('username', sig.author).maybeSingle();
            return { ...sig, author_avatar: p?.avatar_url, author_country: p?.country || sig.distance, author_occupation: p?.occupation || sig.role, comments: sig.comments ? sig.comments.sort((a:any, b:any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) : [] };
        }));
        setSignals(enrichedData);
    }
    const { data: question } = await supabase.from('daily_questions').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (question) setDailyQuestion(question);
    const { data: missionData } = await supabase.from('missions').select('*').order('created_at', { ascending: false });
    if (missionData) {
        const oneWeekAgo = new Date(); oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        setMissions(missionData.filter((m: any) => new Date(m.created_at) > oneWeekAgo) as MissionData[]);
    }
    setIsLoading(false);
  };
  
  const fetchDailyResponses = async (questionId: number) => {
      const { data } = await supabase.from('signals').select('*, comments(*), likes(*)').eq('daily_question_id', questionId).order('created_at', { ascending: false });
      if (data) {
        const enrichedData = await Promise.all(data.map(async (sig) => {
            const { data: p } = await supabase.from('profiles').select('avatar_url, country, occupation').eq('username', sig.author).maybeSingle();
            return { ...sig, author_avatar: p?.avatar_url, author_country: p?.country || sig.distance, author_occupation: p?.occupation || sig.role, comments: sig.comments ? sig.comments.sort((a:any, b:any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) : [] };
        }));
        setDailyResponses(enrichedData);
      }
  };

  const handleSendSignal = async (e: React.MouseEvent, signalId: number) => {
    e.stopPropagation();
    if (!user) return alert("Please login.");
    const { data: existing } = await supabase.from('likes').select('*').eq('user_id', user.id).eq('signal_id', signalId).maybeSingle();
    if (existing) await supabase.from('likes').delete().eq('id', existing.id);
    else await supabase.from('likes').insert({ user_id: user.id, signal_id: signalId });
    await fetchSignals(); 
  };

  const handleTranslate = async (e: React.MouseEvent, signal: any) => {
      e.stopPropagation(); 
      if (translatedIDs[signal.id]) { setTranslatedIDs(prev => ({ ...prev, [signal.id]: false })); return; }
      if (signal.translation) { setTranslatedIDs(prev => ({ ...prev, [signal.id]: true })); return; }
      const translatedText = await translateText(signal.content);
      const updateList = (list: any[]) => list.map(s => s.id === signal.id ? { ...s, translation: translatedText } : s);
      setSignals(prev => updateList(prev));
      setTranslatedIDs(prev => ({ ...prev, [signal.id]: true }));
  };

  const handleBroadcast = async () => {
    if (!messageText.trim() || !user) return;
    setIsSending(true);
    const translated = await translateText(messageText);
    await supabase.from('signals').insert({
        content: messageText, translation: translated, frequency: selectedFreq.id,
        author: profile?.username || user.user_metadata.full_name, role: profile?.occupation || 'Explorer', distance: profile?.country || 'Near Orbit'
    });
    setMessageText(""); setIsWriting(false); await fetchSignals(); setIsSending(false);
  };
  
  const handleDailyResponse = async () => {
    if (!dailyResponseText.trim() || !user || !dailyQuestion) return;
    setIsSending(true);
    await supabase.from('signals').insert({
        content: dailyResponseText, frequency: 'general', author: profile?.username || user.user_metadata.full_name,
        role: profile?.occupation || 'Explorer', daily_question_id: dailyQuestion.id
    });
    setDailyResponseText(""); await fetchDailyResponses(dailyQuestion.id); setIsSending(false);
  };

  const handlePostComment = async (signalId: number) => {
      if (!commentText.trim() || !user) return;
      await supabase.from('comments').insert({ signal_id: signalId, content: commentText, author: profile?.username || user.user_metadata.full_name });
      setCommentText(""); await fetchSignals();
      if(selectedSignal) {
         const updated = { ...selectedSignal, comments: [...(selectedSignal.comments || []), { id: Date.now(), content: commentText, author: profile?.username, created_at: new Date().toISOString() }] };
         setSelectedSignal(updated as any);
      }
  };

  const handleCreateMission = async () => {
      if (!user || !newMission.contact_email) return alert("Email is required.");
      setIsPostingMission(true);
      const contactInfoJSON = JSON.stringify({ email: newMission.contact_email, skype: newMission.contact_skype, instagram: newMission.contact_insta });
      await supabase.from('missions').insert({ title: newMission.title, type: newMission.type, description: newMission.description, budget: newMission.budget, contact_info: contactInfoJSON, user_id: user.id });
      setNewMission({ title: '', type: 'partner', description: '', budget: '', contact_email: '', contact_skype: '', contact_insta: '' }); setIsMissionModalOpen(false); await fetchSignals(); setIsPostingMission(false);
  };

  const filteredSignals = signals.filter(s => s.content.toLowerCase().includes(searchQuery.toLowerCase()) || s.author.toLowerCase().includes(searchQuery.toLowerCase()) || (s.translation && s.translation.toLowerCase().includes(searchQuery.toLowerCase())));

  // --- RENDER ---
  return (
    <div className="relative min-h-screen w-full bg-[#020202] text-cyan-50 font-mono overflow-hidden terminal-grid-bg selection:bg-cyan-500/20">
      {showSetup && user && ( <ProfileSetup userId={user.id} onComplete={() => { setShowSetup(false); fetchProfile(user.id); }} /> )}
      <div className="scanline"></div>

      {/* TOP BAR - TERMINAL HEADER */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black border-b-2 border-cyan-900/50 px-4 py-2 flex justify-between items-center uppercase tracking-widest text-xs">
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-cyan-400 font-bold">
                <Terminal className="w-4 h-4" />
                <span>TLP.SYS // VER 2.0.1</span>
            </div>
            <div className="hidden md:flex items-center gap-2 text-zinc-500">
                <Activity className="w-3 h-3 animate-pulse" />
                <span>UPLINK: STABLE</span>
            </div>
        </div>
        <div className="flex items-center gap-4 font-bold">
            <span className="text-zinc-500">{currentTime.toLocaleTimeString([], {hour12:false})} UTC</span>
            {user ? (
                <div className="flex items-center gap-2 text-cyan-400 cursor-pointer hover:text-cyan-300 transition-colors" onClick={() => router.push(`/profile/${encodeURIComponent(profile?.username || user.id)}`)}>
                    <span>[{profile?.username || user.email.split('@')[0]}]</span>
                    <LogOut className="w-3 h-3 hover:text-red-500" onClick={(e) => { e.stopPropagation(); supabase.auth.signOut(); }} />
                </div>
            ) : (
                <button onClick={() => supabase.auth.signInWithOAuth({ provider: 'google' })} className="text-cyan-400 hover:text-cyan-300">[ INITIALIZE LOGIN ]</button>
            )}
        </div>
      </header>

      <div className="flex h-screen pt-10 max-w-[1920px] mx-auto">
        
        {/* SOL PANEL - KONTROL MERKEZİ */}
        <aside className="hidden md:flex flex-col w-72 border-r-2 border-cyan-900/50 bg-black p-4 z-40">
            <div className="mb-8">
                <h1 className="text-2xl font-black tracking-tighter text-white mb-1">THE LAST<br/><span className="text-cyan-400">PENGUIN</span></h1>
                <p className="text-[10px] text-zinc-500 uppercase tracking-[0.2em]">Frequency Scanner Unit</p>
            </div>

            <button onClick={() => setIsWriting(true)} className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold py-3 px-4 flex items-center justify-center gap-2 transition-all uppercase tracking-wider text-sm mb-6 border-2 border-cyan-500 hover:border-cyan-300 active:translate-y-0.5">
                <Zap className="w-4 h-4 fill-black" /> NEW BROADCAST
            </button>

            <nav className="space-y-1 flex-1">
                <div className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold mb-2 pl-2">Frequency Filters</div>
                <button onClick={() => setFilterFreq('all')} className={`w-full flex items-center gap-3 px-3 py-2 transition-all border-l-2 text-sm ${filterFreq === 'all' ? 'border-cyan-400 text-cyan-400 bg-cyan-950/30' : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'}`}>
                    <LayoutGrid className="w-4 h-4" /> [ALL SIGNALS]
                </button>
                {FREQUENCIES.map((freq) => (
                    <button key={freq.id} onClick={() => setFilterFreq(freq.id)} className={`w-full flex items-center gap-3 px-3 py-2 transition-all border-l-2 text-sm uppercase ${filterFreq === freq.id ? `border-${freq.color.split('-')[1]} text-${freq.color.split('-')[1]} bg-${freq.color.split('-')[1]}/10` : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'}`}>
                        <Hash className="w-4 h-4" /> [{freq.name}]
                    </button>
                ))}
            </nav>

            <div className="mt-auto pt-4 border-t-2 border-cyan-900/30">
                 <button onClick={() => setIsGlobalEnglish(!isGlobalEnglish)} className={`w-full flex items-center gap-2 px-3 py-2 text-xs uppercase tracking-wider border-2 transition-all ${isGlobalEnglish ? 'border-cyan-400 text-cyan-400 bg-cyan-950/30' : 'border-zinc-800 text-zinc-500 hover:border-zinc-600'}`}>
                    <Globe className="w-4 h-4" /> {isGlobalEnglish ? 'Auto-Translate: ON' : 'Auto-Translate: OFF'}
                </button>
            </div>
        </aside>

        {/* ORTA PANEL - VERİ AKIŞI (FEED) */}
        <main className="flex-1 h-full overflow-y-auto relative scroll-smooth no-scrollbar bg-black/80 z-30">
            <div className="max-w-3xl mx-auto p-4 md:p-8 pb-32">
                
                {/* SEARCH & MOBILE CONTROLS */}
                <div className="mb-8 flex gap-2 sticky top-0 pt-4 bg-black/80 backdrop-blur-md z-40 pb-4 border-b-2 border-cyan-900/30">
                    <div className="flex-1 relative flex items-center bg-zinc-900 border-2 border-zinc-800 p-1 px-3 focus-within:border-cyan-400 transition-all">
                        <Search className="w-5 h-5 text-zinc-600 mr-2" />
                        <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="SEARCH DATABASE..." className="bg-transparent border-none outline-none text-cyan-50 w-full placeholder:text-zinc-700 font-mono text-sm uppercase" />
                    </div>
                     <button onClick={() => setIsMissionListOpen(!isMissionListOpen)} className="md:hidden p-3 border-2 border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-cyan-400 hover:border-cyan-400 transition-all"><Briefcase className="w-5 h-5" /></button>
                </div>

                {/* DAILY QUESTION TERMINAL */}
                {dailyQuestion && (
                    <div onClick={() => { if(dailyQuestion) { fetchDailyResponses(dailyQuestion.id); setIsDailyOpen(true); } }} className="mb-8 border-2 border-dashed border-cyan-500/30 p-4 bg-cyan-950/10 cursor-pointer hover:bg-cyan-950/20 hover:border-cyan-400/50 transition-all group relative overflow-hidden">
                        <div className="absolute top-0 left-0 bg-cyan-400 text-black text-[9px] font-bold px-2 py-1 uppercase tracking-widest">Priority Intercept</div>
                        <div className="mt-4">
                            <h3 className="text-lg md:text-xl font-bold text-white mb-2 uppercase tracking-tight">"{dailyQuestion.content}"</h3>
                             <div className="flex justify-between items-end">
                                <div className="text-xs text-cyan-600 uppercase tracking-widest flex items-center gap-2"><Sparkles className="w-3 h-3" /> {dailyResponses.length} Responses Logged</div>
                                <span className="text-cyan-400 text-sm font-bold group-hover:underline decoration-2 underline-offset-4">ACCESS LOG &gt;&gt;</span>
                            </div>
                        </div>
                        <div className="absolute inset-0 border-2 border-cyan-500/0 group-hover:border-cyan-500/100 transition-all pointer-events-none animate-pulse"></div>
                    </div>
                )}

                {/* DATA STREAM (FEED) */}
                <div className="space-y-4">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <Cpu className="w-12 h-12 text-cyan-500 animate-spin" />
                            <div className="text-cyan-500 text-sm uppercase tracking-[0.3em] animate-pulse">Initializing Data Stream...</div>
                        </div>
                    ) : filteredSignals.map((signal) => (
                        <div key={signal.id} onClick={() => setSelectedSignal(signal)} className="bg-zinc-950 border-2 border-zinc-800 p-5 cursor-pointer hover:border-cyan-700/50 transition-all group relative">
                            {/* Header Data */}
                            <div className="flex justify-between items-start mb-4 text-xs font-mono pb-3 border-b border-zinc-900">
                                <div className="flex items-center gap-3">
                                     <div className="w-8 h-8 bg-zinc-900 border border-zinc-700 flex items-center justify-center font-bold text-zinc-400 group-hover:text-cyan-400 group-hover:border-cyan-400 transition-colors">
                                        {signal.author.slice(0,2).toUpperCase()}
                                     </div>
                                     <div>
                                        <div className="font-bold text-white group-hover:text-cyan-400 transition-colors">User: [{signal.author}]</div>
                                        <div className="text-zinc-600">Role: &lt;{signal.role || 'Unknown'}&gt;</div>
                                     </div>
                                </div>
                                <div className="text-right">
                                    <div className={`font-bold uppercase ${getFrequencyColor(signal.frequency).split(' ')[0]}`}>Freq: {signal.frequency}</div>
                                    <div className="text-zinc-600">T-Stamp: {new Date(signal.created_at).toLocaleTimeString([], {hour12:false})}</div>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="mb-4 font-sans text-sm md:text-base text-zinc-200 leading-relaxed whitespace-pre-wrap border-l-4 border-zinc-800 pl-4 group-hover:border-cyan-700/50 transition-colors">
                                {renderText(signal)}
                            </div>

                            {/* Footer Data/Controls */}
                            <div className="flex items-center gap-4 text-xs font-bold text-zinc-500 pt-2">
                                <button onClick={(e) => handleSendSignal(e, signal.id)} className={`flex items-center gap-2 px-2 py-1 border border-transparent hover:border-zinc-700 hover:bg-zinc-900 transition-all ${signal.likes?.some((l:any) => l.user_id === user?.id) ? 'text-cyan-400' : ''}`}>
                                    <Radio className="w-4 h-4" /> <span className="font-mono">SIG: {signal.likes?.length || 0}</span>
                                </button>
                                <button className="flex items-center gap-2 px-2 py-1 border border-transparent hover:border-zinc-700 hover:bg-zinc-900 transition-all">
                                    <MessageSquare className="w-4 h-4" /> <span className="font-mono">COM: {signal.comments?.length || 0}</span>
                                </button>
                                <button onClick={(e) => handleTranslate(e, signal)} className="ml-auto px-2 py-1 border border-transparent hover:border-zinc-700 hover:bg-zinc-900 transition-all hover:text-cyan-400"><Globe className="w-4 h-4" /></button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </main>

        {/* SAĞ PANEL - GÖREVLER (DESKTOP) */}
        <aside className="hidden lg:flex flex-col w-80 border-l-2 border-cyan-900/50 bg-black p-4 z-40 overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-6 pb-4 border-b-2 border-cyan-900/30">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2"><Briefcase className="w-4 h-4 text-cyan-400" /> Active Missions</h3>
                <button onClick={() => setIsMissionModalOpen(true)} className="p-1.5 bg-cyan-500 hover:bg-cyan-400 text-black rounded-sm transition-all"><Plus className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
                {missions.map((mission) => (
                    <div key={mission.id} onClick={() => setSelectedMission(mission)} className="bg-zinc-950 border-2 border-zinc-800 p-3 cursor-pointer hover:border-cyan-500 hover:bg-cyan-950/10 transition-all group">
                        <div className="flex justify-between items-start mb-2 text-[9px] font-bold uppercase tracking-wider font-mono">
                            <span className={`px-1.5 py-0.5 border ${mission.type === 'paid' ? 'text-emerald-400 border-emerald-400' : 'text-blue-400 border-blue-400'}`}>{mission.type}</span>
                            <span className="text-zinc-600">{new Date(mission.created_at).toLocaleDateString()}</span>
                        </div>
                        <h4 className="font-bold text-xs text-white mb-2 line-clamp-1 group-hover:text-cyan-400">{mission.title}</h4>
                        <div className="text-[10px] font-mono text-zinc-500 flex justify-between">
                            <span className="text-cyan-600 font-bold">ALLOC: {mission.budget}</span>
                             <ChevronRight className="w-3 h-3 text-zinc-700 group-hover:text-cyan-400" />
                        </div>
                    </div>
                ))}
                {missions.length === 0 && <div className="text-center text-zinc-700 text-xs py-10 font-mono uppercase border-2 border-dashed border-zinc-800">No Active Contracts Detected.</div>}
            </div>
        </aside>
      </div>

      {/* MOBILE ACTION BUTTON */}
      <button onClick={() => setIsWriting(true)} className="md:hidden fixed bottom-6 right-6 z-50 w-14 h-14 bg-cyan-500 text-black flex items-center justify-center shadow-lg shadow-cyan-500/20 hover:scale-105 active:scale-95 transition-all border-2 border-cyan-400">
          <Zap className="w-6 h-6" />
      </button>

      <AnimatePresence>
        {/* WRITE MODAL (Original Component, just needs theme context) */}
        <WriteModal isOpen={isWriting} onClose={() => setIsWriting(false)} messageText={messageText} setMessageText={setMessageText} onBroadcast={handleBroadcast} isSending={isSending} selectedFreq={selectedFreq} setSelectedFreq={setSelectedFreq} />
        
        {/* SIGNAL DETAIL MODAL (Terminal Style) */}
        {selectedSignal && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm" onClick={() => setSelectedSignal(null)}>
                <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="w-full max-w-2xl bg-black border-2 border-cyan-500/50 flex flex-col max-h-[90vh] relative" onClick={(e) => e.stopPropagation()}>
                    <div className="absolute inset-0 pointer-events-none bg-[url('/grid.png')] opacity-10"></div>
                    <div className="p-4 border-b-2 border-cyan-900/50 flex justify-between items-center bg-cyan-950/20">
                        <div className="font-mono text-xs text-cyan-400 font-bold uppercase tracking-wider">Reading Signal Data...</div>
                        <button onClick={() => setSelectedSignal(null)} className="p-1 hover:bg-cyan-950/50 border border-transparent hover:border-cyan-500/50 text-cyan-400 transition-all"><X className="w-5 h-5" /></button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-black relative z-10">
                        <div className="flex gap-4 mb-6 pb-4 border-b border-zinc-900 font-mono text-xs">
                            <div className="w-12 h-12 bg-zinc-900 border-2 border-zinc-700 flex items-center justify-center font-bold text-zinc-400 text-lg shrink-0">{selectedSignal.author.slice(0,2).toUpperCase()}</div>
                            <div className="flex-1">
                                <div className="font-bold text-white text-base">USER: {selectedSignal.author.toUpperCase()}</div>
                                <div className="text-zinc-500 mt-1">FREQ: <span className={getFrequencyColor(selectedSignal.frequency).split(' ')[0]}>{selectedSignal.frequency.toUpperCase()}</span> | TIME: {new Date(selectedSignal.created_at).toLocaleString()}</div>
                            </div>
                             <button onClick={(e) => handleTranslate(e, selectedSignal)} className="h-8 px-3 border border-zinc-700 hover:border-cyan-400 hover:text-cyan-400 text-zinc-500 transition-all flex items-center gap-2"><Globe className="w-4 h-4" /> TRNSL</button>
                        </div>
                        <p className="text-lg leading-relaxed text-white mb-8 whitespace-pre-wrap font-sans pl-4 border-l-4 border-cyan-500/50">{renderText(selectedSignal)}</p>
                        
                        <div>
                            <h4 className="text-xs font-bold text-cyan-600 uppercase tracking-widest mb-4 font-mono border-b border-zinc-900 pb-2">Comm Logs [{selectedSignal.comments?.length || 0}]</h4>
                            <div className="space-y-4">
                                {selectedSignal.comments?.map(c => (
                                    <div key={c.id} className="flex gap-3 font-mono text-xs pl-2 border-l-2 border-zinc-800">
                                        <span className="font-bold text-cyan-400 shrink-0">[{c.author}]:</span>
                                        <span className="text-zinc-300 font-sans">{c.content}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="p-4 border-t-2 border-cyan-900/50 bg-black relative z-10 flex gap-2">
                        <input value={commentText} onChange={e => setCommentText(e.target.value)} className="flex-1 bg-zinc-900 border-2 border-zinc-800 px-4 py-3 outline-none text-sm text-white font-mono focus:border-cyan-500 transition-all placeholder:text-zinc-700" placeholder="ENTER REPLY DATA..." onKeyDown={e => e.key === 'Enter' && handlePostComment(selectedSignal.id)} />
                        <button onClick={() => handlePostComment(selectedSignal.id)} className="px-6 bg-cyan-500 text-black font-bold hover:bg-cyan-400 border-2 border-cyan-500 transition-all uppercase tracking-wider text-sm">SEND</button>
                    </div>
                </motion.div>
            </motion.div>
        )}

        {/* MISSION MODALS (Terminal Style) */}
        {isMissionModalOpen && (
            <div className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4 font-mono">
                <div className="w-full max-w-md bg-black border-2 border-cyan-500 p-6 space-y-4 relative relative overflow-hidden">
                     <div className="absolute inset-0 bg-[url('/grid.png')] opacity-10 pointer-events-none"></div>
                     <div className="absolute top-0 left-0 w-full h-1 bg-cyan-500 animate-pulse"></div>
                    <h3 className="font-bold text-xl text-cyan-400 uppercase tracking-wider mb-6 relative z-10">Initialize New Contract</h3>
                    <div className="space-y-4 relative z-10">
                        <input placeholder="PROTOCOL TITLE" value={newMission.title} onChange={e => setNewMission({...newMission, title: e.target.value})} className="w-full bg-zinc-900 p-3 border-2 border-zinc-800 outline-none focus:border-cyan-500 text-white text-sm" />
                        <div className="flex gap-2">
                            <select className="bg-zinc-900 p-3 flex-1 border-2 border-zinc-800 outline-none focus:border-cyan-500 text-white text-sm appearance-none uppercase" onChange={e => setNewMission({...newMission, type: e.target.value as any})}><option value="partner" className="bg-black">TYPE: PARTNER</option><option value="paid" className="bg-black">TYPE: PAID BOUNTY</option></select>
                            <input placeholder="ALLOCATION (BUDGET)" className="bg-zinc-900 p-3 flex-1 border-2 border-zinc-800 outline-none focus:border-cyan-500 text-white text-sm" onChange={e => setNewMission({...newMission, budget: e.target.value})} />
                        </div>
                        <textarea placeholder="MISSION BRIEFING DETAILS..." className="w-full bg-zinc-900 p-3 border-2 border-zinc-800 outline-none focus:border-cyan-500 text-white text-sm h-32" onChange={e => setNewMission({...newMission, description: e.target.value})} />
                        <input placeholder="SECURE COMMS CHANNEL (EMAIL)" className="w-full bg-zinc-900 p-3 border-2 border-zinc-800 outline-none focus:border-cyan-500 text-white text-sm" onChange={e => setNewMission({...newMission, contact_email: e.target.value})} />
                    </div>
                    <div className="flex gap-2 pt-4 relative z-10">
                        <button onClick={() => setIsMissionModalOpen(false)} className="flex-1 py-3 border-2 border-zinc-700 text-zinc-500 hover:text-white hover:border-white transition-all uppercase font-bold text-sm">ABORT</button>
                        <button onClick={handleCreateMission} className="flex-1 py-3 bg-cyan-500 text-black font-bold border-2 border-cyan-500 hover:bg-cyan-400 transition-all uppercase tracking-wider text-sm">{isPostingMission ? "PROCESSING..." : "DEPLOY CONTRACT"}</button>
                    </div>
                </div>
            </div>
        )}

        {selectedMission && (
            <div className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4 font-mono" onClick={() => setSelectedMission(null)}>
                <div className="w-full max-w-lg bg-black border-2 border-cyan-500 p-8 relative shadow-[0_0_50px_-10px_rgba(6,182,212,0.3)]" onClick={e => e.stopPropagation()}>
                    <button className="absolute top-4 right-4 text-zinc-500 hover:text-red-500 transition-colors" onClick={() => setSelectedMission(null)}><X className="w-6 h-6" /></button>
                    <span className={`text-xs font-bold uppercase tracking-[0.2em] mb-2 block ${selectedMission.type === 'paid' ? 'text-emerald-400' : 'text-blue-400'}`}>CONTRACT TYPE: {selectedMission.type}</span>
                    <h2 className="text-2xl font-bold mb-6 text-white uppercase border-b-2 border-zinc-800 pb-4">{selectedMission.title}</h2>
                    <div className="mb-6">
                         <div className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold mb-2">Briefing</div>
                        <p className="text-zinc-300 leading-relaxed font-sans border-l-4 border-cyan-900 pl-4">{selectedMission.description}</p>
                    </div>
                    <div className="flex gap-4 mb-6 text-xs">
                        <div className="flex-1 bg-zinc-900 p-3 border-2 border-zinc-800"><div className="text-zinc-600 font-bold mb-1">ALLOCATION</div><div className="text-cyan-400 font-bold">{selectedMission.budget}</div></div>
                        <div className="flex-1 bg-zinc-900 p-3 border-2 border-zinc-800"><div className="text-zinc-600 font-bold mb-1">DATE TIMESTAMP</div><div className="text-white">{new Date(selectedMission.created_at).toLocaleDateString()}</div></div>
                    </div>
                    <div className="bg-cyan-950/20 p-4 border-2 border-cyan-900/50 font-mono text-sm break-all text-cyan-300">
                        <div className="text-[10px] text-cyan-600 uppercase tracking-widest font-bold mb-2 flex items-center gap-2"><Zap className="w-3 h-3" /> Secure Comms Link</div>
                        {selectedMission.contact_info}
                    </div>
                </div>
            </div>
        )}

        {/* MOBILE MISSION LIST & DAILY MODAL (Basitleştirilmiş Terminal Stili) */}
        {(isMissionListOpen || isDailyOpen) && (
            <div className="fixed inset-0 z-[150] bg-black/95 p-4 md:hidden overflow-y-auto font-mono">
                <div className="flex justify-end"><button onClick={() => {setIsMissionListOpen(false); setIsDailyOpen(false)}} className="p-2 border-2 border-zinc-800 text-zinc-500"><X className="w-6 h-6" /></button></div>
                
                {isMissionListOpen && (
                    <div className="mt-8 space-y-4">
                        <h2 className="text-xl font-bold text-cyan-400 uppercase tracking-wider border-b-2 border-cyan-900 pb-4 mb-6">Active Contracts</h2>
                         {missions.map((mission) => (
                            <div key={mission.id} onClick={() => {setSelectedMission(mission); setIsMissionListOpen(false)}} className="bg-zinc-900 border-2 border-zinc-800 p-4 cursor-pointer active:bg-cyan-950/30 active:border-cyan-500 transition-all">
                                <div className="flex justify-between text-[10px] font-bold uppercase mb-2"><span className={mission.type==='paid'?'text-emerald-400':'text-blue-400'}>{mission.type}</span><span className="text-zinc-600">{new Date(mission.created_at).toLocaleDateString()}</span></div>
                                <h4 className="font-bold text-white">{mission.title}</h4>
                                <div className="text-xs text-cyan-600 mt-2 font-bold">{mission.budget}</div>
                            </div>
                        ))}
                        <button onClick={() => {setIsMissionModalOpen(true); setIsMissionListOpen(false)}} className="w-full py-4 border-2 border-dashed border-zinc-700 text-zinc-500 uppercase font-bold tracking-wider hover:text-cyan-400 hover:border-cyan-400 transition-all">+ INITIALIZE NEW CONTRACT</button>
                    </div>
                )}

                 {isDailyOpen && dailyQuestion && (
                    <div className="mt-8">
                        <h2 className="text-lg font-bold text-white uppercase tracking-wider border-b-2 border-cyan-900 pb-4 mb-6">Daily Intercept Log</h2>
                        <div className="text-xl font-serif italic text-cyan-100 mb-8 p-4 bg-cyan-950/20 border-l-4 border-cyan-500">"{dailyQuestion.content}"</div>
                        <div className="space-y-4 mb-8 max-h-[40vh] overflow-y-auto">
                             {dailyResponses.map((res) => (
                                <div key={res.id} className="text-sm border-l-2 border-zinc-800 pl-4 py-2"><div className="font-bold text-zinc-500 mb-1">[{res.author}]</div><p className="text-zinc-300 font-sans">{res.content}</p></div>
                            ))}
                        </div>
                        <div className="flex gap-2">
                             <input value={dailyResponseText} onChange={e => setDailyResponseText(e.target.value)} className="flex-1 bg-zinc-900 border-2 border-zinc-800 px-4 py-3 outline-none text-sm text-white font-mono focus:border-cyan-500 transition-all" placeholder="ENTER TRANSMISSION..." />
                             <button onClick={handleDailyResponse} className="px-4 bg-cyan-500 text-black font-bold border-2 border-cyan-500">SEND</button>
                        </div>
                    </div>
                )}
            </div>
        )}

      </AnimatePresence>
    </div>
  );
}