"use client";

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { 
  MessageSquare, ChevronDown, RefreshCw, User, CornerDownRight, 
  LogIn, LogOut, Search, Plus, Reply, Sparkles, Globe, 
  Briefcase, DollarSign, Calendar, Mail, Maximize2, AtSign, Video, Instagram, 
  Podcast, BarChart3, Radio, Zap, X, Layers, LayoutGrid
} from "lucide-react";

import LavaBackground from '@/components/LavaBackground';
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

export default function LighthousePage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  
  // --- STATE ---
  const [signals, setSignals] = useState<SignalData[]>([]);
  const [dailyQuestion, setDailyQuestion] = useState<any>(null);
  const [dailyResponses, setDailyResponses] = useState<SignalData[]>([]);
  const [missions, setMissions] = useState<MissionData[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterFreq, setFilterFreq] = useState("all");
  const [isGlobalEnglish, setIsGlobalEnglish] = useState(false);
  const [translatedIDs, setTranslatedIDs] = useState<{[key: number]: boolean}>({});

  // Modallar
  const [isDailyOpen, setIsDailyOpen] = useState(false);
  const [isMissionModalOpen, setIsMissionModalOpen] = useState(false);
  const [isMissionListOpen, setIsMissionListOpen] = useState(false);
  const [selectedMission, setSelectedMission] = useState<MissionData | null>(null);
  const [selectedSignal, setSelectedSignal] = useState<SignalData | null>(null); 
  const [isWriting, setIsWriting] = useState(false);

  // Form Verileri
  const [selectedFreq, setSelectedFreq] = useState(FREQUENCIES[1]);
  const [messageText, setMessageText] = useState("");
  const [dailyResponseText, setDailyResponseText] = useState(""); 
  const [isSending, setIsSending] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [newMission, setNewMission] = useState({ title: '', type: 'partner' as 'partner' | 'paid', description: '', budget: '', contact_email: '', contact_skype: '', contact_insta: '' });
  const [isPostingMission, setIsPostingMission] = useState(false);

  // --- DATA FETCHING ---
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

  // Çeviri Tetikleyici
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

  // Realtime
  useEffect(() => {
    const channel = supabase.channel('realtime-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'signals' }, () => { fetchSignals(); if (dailyQuestion && isDailyOpen) fetchDailyResponses(dailyQuestion.id); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'missions' }, () => fetchSignals())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments' }, (payload) => fetchSignals())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'likes' }, (payload) => { handleNewLikeNotification(payload.new); fetchSignals(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile, isDailyOpen, dailyQuestion]);

  const addNotification = (message: string) => {
      const newNotif = { id: Date.now(), message };
      setNotifications(prev => [newNotif, ...prev]);
      setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== newNotif.id)), 6000);
  };

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
    if (dailyQuestion && isDailyOpen) fetchDailyResponses(dailyQuestion.id);
  };

  const handleNewLikeNotification = async (likeData: any) => {
    const { data: signalOwner } = await supabase.from('signals').select('author').eq('id', likeData.signal_id).single();
    if (signalOwner && signalOwner.author === profile?.username && likeData.user_id !== user?.id) {
        const { data: sender } = await supabase.from('profiles').select('country').eq('id', likeData.user_id).single();
        addNotification(`New signal from ${sender?.country || 'Unknown Sector'}! 📡`);
    }
  };

  const handleTranslate = async (e: React.MouseEvent, signal: any) => {
      e.stopPropagation(); 
      if (translatedIDs[signal.id]) { setTranslatedIDs(prev => ({ ...prev, [signal.id]: false })); return; }
      if (signal.translation) { setTranslatedIDs(prev => ({ ...prev, [signal.id]: true })); return; }
      const translatedText = await translateText(signal.content);
      const updateList = (list: any[]) => list.map(s => s.id === signal.id ? { ...s, translation: translatedText } : s);
      setSignals(prev => updateList(prev));
      setDailyResponses(prev => updateList(prev));
      setTranslatedIDs(prev => ({ ...prev, [signal.id]: true }));
  };

  const handleBroadcast = async () => {
    if (!messageText.trim() || !user) return;
    setIsSending(true);
    const translated = await translateText(messageText);
    const { error } = await supabase.from('signals').insert({
        content: messageText, translation: translated, frequency: selectedFreq.id,
        author: profile?.username || user.user_metadata.full_name, role: profile?.occupation || 'Explorer', distance: profile?.country || 'Near Orbit'
    });
    if (!error) { setMessageText(""); setIsWriting(false); await fetchSignals(); }
    setIsSending(false);
  };

  const handleDailyResponse = async () => {
    if (!dailyResponseText.trim() || !user || !dailyQuestion) return;
    setIsSending(true);
    const translated = await translateText(dailyResponseText);
    const { error } = await supabase.from('signals').insert({
        content: dailyResponseText, translation: translated, frequency: 'general', author: profile?.username || user.user_metadata.full_name,
        role: profile?.occupation || 'Explorer', distance: profile?.country || 'Near Orbit', daily_question_id: dailyQuestion.id
    });
    if (!error) { setDailyResponseText(""); await fetchDailyResponses(dailyQuestion.id); }
    setIsSending(false);
  };

  const handlePostComment = async (signalId: number) => {
      if (!commentText.trim() || !user) return;
      setIsPostingComment(true);
      const { error } = await supabase.from('comments').insert({ signal_id: signalId, content: commentText, author: profile?.username || user.user_metadata.full_name, reply_to: replyingTo });
      if (!error) { 
          setCommentText(""); setReplyingTo(null); await fetchSignals(); 
          if(selectedSignal) {
             const updated = { ...selectedSignal, comments: [...(selectedSignal.comments || []), { id: Date.now(), content: commentText, author: profile?.username, created_at: new Date().toISOString() }] };
             setSelectedSignal(updated as any);
          }
      }
      setIsPostingComment(false);
  };

  const handleCreateMission = async () => {
      if (!user || !newMission.contact_email) return alert("Email is required.");
      setIsPostingMission(true);
      const contactInfoJSON = JSON.stringify({ email: newMission.contact_email, skype: newMission.contact_skype, instagram: newMission.contact_insta });
      const { error } = await supabase.from('missions').insert({ title: newMission.title, type: newMission.type, description: newMission.description, budget: newMission.budget, contact_info: contactInfoJSON, user_id: user.id });
      if (!error) { setNewMission({ title: '', type: 'partner', description: '', budget: '', contact_email: '', contact_skype: '', contact_insta: '' }); setIsMissionModalOpen(false); await fetchSignals(); }
      setIsPostingMission(false);
  };

  const renderContactInfo = (contactInfoStr: string) => {
      try {
          const contact = JSON.parse(contactInfoStr);
          return (
              <div className="flex flex-col gap-2">
                  {contact.email && <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-sm text-white hover:text-emerald-400 transition-colors truncate"><AtSign className="w-4 h-4 text-emerald-400 shrink-0" /> <span className="truncate">{contact.email}</span></a>}
                  {contact.skype && <a href={`skype:${contact.skype}?chat`} className="flex items-center gap-2 text-sm text-white hover:text-blue-400 transition-colors truncate"><Video className="w-4 h-4 text-blue-400 shrink-0" /> <span className="truncate">{contact.skype}</span></a>}
                  {contact.instagram && <a href={`https://instagram.com/${contact.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-white hover:text-pink-400 transition-colors truncate"><Instagram className="w-4 h-4 text-pink-400 shrink-0" /> <span className="truncate">@{contact.instagram.replace('@', '')}</span></a>}
              </div>
          );
      } catch (e) { return <div className="text-sm text-white font-mono select-all cursor-pointer break-all">{contactInfoStr}</div>; }
  };

  const renderText = (signal: SignalData) => {
      if ((isGlobalEnglish || translatedIDs[signal.id]) && signal.translation) return signal.translation;
      return signal.content;
  };

  // EKSİK OLAN FONKSİYON EKLENDİ
  const getFrequencyColor = (freqId: string) => {
    const freq = FREQUENCIES.find(f => f.id === freqId);
    return freq ? `text-[${freq.color.replace('bg-', '')}] border-[${freq.color.replace('bg-', '')}]/50` : 'text-zinc-400 border-white/10';
  };

  const filteredSignals = signals.filter(s => s.content.toLowerCase().includes(searchQuery.toLowerCase()) || s.author.toLowerCase().includes(searchQuery.toLowerCase()) || (s.translation && s.translation.toLowerCase().includes(searchQuery.toLowerCase())));

  // --- RENDER ---
  return (
    <div className="relative min-h-screen w-full bg-black text-white font-sans overflow-x-hidden selection:bg-emerald-500/30">
      <LavaBackground />
      {showSetup && user && ( <ProfileSetup userId={user.id} onComplete={() => { setShowSetup(false); fetchProfile(user.id); }} /> )}

      {/* NOTIFICATION TOAST */}
      <div className="fixed top-24 right-8 z-[100] flex flex-col gap-3 pointer-events-none">
        <AnimatePresence>
          {notifications.map((notif) => (
            <motion.div key={notif.id} initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="bg-blue-600/20 backdrop-blur-xl border border-blue-500/30 px-4 py-3 rounded-xl shadow-xl flex items-center gap-3">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
              <span className="text-xs font-bold text-blue-100">{notif.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* HEADER */}
      <header className="fixed top-0 left-0 right-0 z-50 px-6 py-4 flex justify-between items-center bg-black/60 backdrop-blur-lg border-b border-white/5">
        <div className="flex items-center gap-4 cursor-pointer" onClick={() => window.location.reload()}>
            <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center"><Zap className="w-5 h-5 text-black fill-black" /></div>
            <div>
                <h1 className="text-lg font-bold tracking-tighter leading-none">The Last Penguin</h1>
                <span className="text-[10px] text-zinc-500 tracking-widest uppercase">Grid System v2.0</span>
            </div>
        </div>
        
        <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center bg-white/5 border border-white/10 rounded-full px-4 py-2 gap-2 focus-within:border-emerald-500/50 transition-all">
                <Search className="w-3.5 h-3.5 text-zinc-500" />
                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search frequency..." className="bg-transparent border-none outline-none text-xs w-48 text-white placeholder:text-zinc-600" />
            </div>
            
            {user ? (
                <div className="flex items-center gap-3">
                    <button onClick={() => setIsGlobalEnglish(!isGlobalEnglish)} className={`p-2 rounded-full transition-all ${isGlobalEnglish ? 'bg-white text-black' : 'bg-white/5 text-zinc-400 hover:text-white'}`}><Globe className="w-4 h-4" /></button>
                    <img src={user.user_metadata.avatar_url} className="w-9 h-9 rounded-full border border-white/20 cursor-pointer hover:border-emerald-500 transition-colors" onClick={() => router.push(`/profile/${encodeURIComponent(profile?.username || user.id)}`)} />
                </div>
            ) : (
                <button onClick={() => supabase.auth.signInWithOAuth({ provider: 'google' })} className="bg-white text-black px-5 py-2 rounded-full text-xs font-bold uppercase hover:scale-105 transition-transform">Login</button>
            )}
        </div>
      </header>

      <main className="relative z-10 pt-24 px-4 md:px-8 pb-32 max-w-[1920px] mx-auto">
        
        {/* ÜST BÖLÜM: Daily Question & Kategoriler */}
        <div className="flex flex-col items-center gap-6 mb-12">
            {!isLoading && dailyQuestion && (
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-3xl bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-white/10 rounded-2xl p-1 flex items-center justify-between cursor-pointer hover:border-white/20 transition-all group" onClick={() => { if(dailyQuestion) { fetchDailyResponses(dailyQuestion.id); setIsDailyOpen(true); } }}>
                    <div className="flex items-center gap-4 px-4 py-2">
                        <div className="p-2 bg-white/10 rounded-full group-hover:scale-110 transition-transform"><Sparkles className="w-4 h-4 text-blue-300" /></div>
                        <div>
                            <div className="text-[9px] font-bold text-blue-400 uppercase tracking-widest">Daily Frequency</div>
                            <div className="text-sm md:text-base font-serif italic text-zinc-200 line-clamp-1">"{dailyQuestion.content}"</div>
                        </div>
                    </div>
                    <div className="bg-white text-black text-[10px] font-bold px-4 py-2 rounded-xl uppercase tracking-widest group-hover:bg-blue-400 transition-colors mr-2">Open Log</div>
                </motion.div>
            )}

            <div className="flex flex-wrap justify-center gap-2">
                {FREQUENCIES.map((freq) => (
                    <button key={freq.id} onClick={() => setFilterFreq(freq.id)} className={`px-4 py-2 rounded-full text-xs font-bold transition-all border ${filterFreq === freq.id ? 'bg-white text-black border-white' : 'bg-black/40 text-zinc-500 border-white/10 hover:text-white hover:border-white/30'}`}>
                        <span className="flex items-center gap-2">{freq.id !== 'all' && <span className={`w-1.5 h-1.5 rounded-full ${freq.color}`}></span>}{freq.name}</span>
                    </button>
                ))}
            </div>
        </div>

        {/* ANA IZGARA (MASONRY GRID) */}
        {isLoading ? (
            <div className="flex justify-center py-20"><RefreshCw className="w-8 h-8 animate-spin text-zinc-600" /></div>
        ) : (
            <div className="columns-1 md:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-4">
                {/* YENİ SİNYAL OLUŞTURMA KARTI */}
                <div onClick={() => setIsWriting(true)} className="break-inside-avoid bg-white/5 border border-dashed border-white/20 rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-white/10 hover:border-emerald-500/50 transition-all group h-48">
                    <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform"><Podcast className="w-6 h-6 text-zinc-400 group-hover:text-emerald-400" /></div>
                    <h3 className="text-sm font-bold text-white">Broadcast Signal</h3>
                    <p className="text-xs text-zinc-500 mt-1">Share your frequency with the void.</p>
                </div>

                {filteredSignals.map((signal) => (
                    <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} key={signal.id} onClick={() => setSelectedSignal(signal)} className="break-inside-avoid bg-[#0a0a0a]/80 backdrop-blur-md border border-white/10 rounded-2xl p-5 hover:border-white/30 transition-all cursor-pointer group">
                        <div className="flex justify-between items-start mb-3">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-zinc-800 overflow-hidden"><img src={signal.author_avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${signal.author}`} className="w-full h-full object-cover" /></div>
                                <div>
                                    <div className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors">@{signal.author}</div>
                                    <div className="text-[9px] text-zinc-500">{new Date(signal.created_at).toLocaleDateString()}</div>
                                </div>
                            </div>
                            <span className={`text-[9px] font-bold px-2 py-1 rounded border ${getFrequencyColor(signal.frequency)} bg-black`}>{signal.frequency}</span>
                        </div>
                        <p className="text-sm text-zinc-300 leading-relaxed font-serif mb-4 line-clamp-6">"{renderText(signal)}"</p>
                        <div className="flex items-center justify-between pt-4 border-t border-white/5">
                            <div className="flex items-center gap-4 text-zinc-500">
                                <div className="flex items-center gap-1.5 text-xs"><Radio className="w-3.5 h-3.5" /> {signal.likes?.length || 0}</div>
                                <div className="flex items-center gap-1.5 text-xs"><MessageSquare className="w-3.5 h-3.5" /> {signal.comments?.length || 0}</div>
                            </div>
                            <button onClick={(e) => handleSendSignal(e, signal.id)} className={`p-1.5 rounded-full hover:bg-white/10 transition-colors ${signal.likes?.some((l:any) => l.user_id === user?.id) ? 'text-emerald-400' : 'text-zinc-600'}`}><Zap className="w-4 h-4 fill-current" /></button>
                        </div>
                    </motion.div>
                ))}
            </div>
        )}
      </main>

      {/* ALT NAVİGASYON (DOCK) */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 bg-black/80 backdrop-blur-xl border border-white/10 p-2 rounded-2xl flex items-center gap-2 shadow-2xl scale-90 md:scale-100">
          <button onClick={() => window.location.reload()} className="p-3 rounded-xl hover:bg-white/10 text-zinc-400 hover:text-white transition-all"><BarChart3 className="w-5 h-5" /></button>
          <div className="w-px h-6 bg-white/10 mx-1" />
          <button onClick={() => setIsWriting(true)} className="p-3 bg-white text-black rounded-xl hover:scale-105 transition-transform"><Plus className="w-6 h-6" /></button>
          <div className="w-px h-6 bg-white/10 mx-1" />
          <button onClick={() => setIsMissionListOpen(true)} className="p-3 rounded-xl hover:bg-white/10 text-zinc-400 hover:text-white transition-all relative">
              <Briefcase className="w-5 h-5" />
              {missions.length > 0 && <span className="absolute top-2 right-2 w-2 h-2 bg-emerald-500 rounded-full" />}
          </button>
      </div>

      <AnimatePresence>
        <WriteModal isOpen={isWriting} onClose={() => setIsWriting(false)} messageText={messageText} setMessageText={setMessageText} onBroadcast={handleBroadcast} isSending={isSending} selectedFreq={selectedFreq} setSelectedFreq={setSelectedFreq} />
        
        {/* SIGNAL DETAY MODALI */}
        {selectedSignal && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={() => setSelectedSignal(null)}>
                <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="w-full max-w-2xl bg-[#0a0a0a] border border-white/10 rounded-3xl overflow-hidden flex flex-col max-h-[85vh] shadow-2xl" onClick={(e) => e.stopPropagation()}>
                    <div className="p-6 border-b border-white/10 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full overflow-hidden"><img src={selectedSignal.author_avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${selectedSignal.author}`} className="w-full h-full" /></div>
                            <div><div className="font-bold text-white">@{selectedSignal.author}</div><div className="text-xs text-zinc-500 uppercase">{selectedSignal.frequency} Sector</div></div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={(e) => handleTranslate(e, selectedSignal)} className="p-2 rounded-full border border-white/10 hover:bg-white/10"><Globe className="w-4 h-4" /></button>
                            <button onClick={() => setSelectedSignal(null)} className="p-2 hover:bg-white/10 rounded-full"><X className="w-5 h-5" /></button>
                        </div>
                    </div>
                    <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
                        <p className="text-xl md:text-2xl font-serif text-zinc-200 leading-relaxed">"{renderText(selectedSignal)}"</p>
                        <div className="mt-8 pt-8 border-t border-white/5 space-y-4">
                            {selectedSignal.comments?.map((comment: any) => (
                                <div key={comment.id} className="flex gap-3 text-sm">
                                    <span className="font-bold text-zinc-400">@{comment.author}:</span>
                                    <span className="text-zinc-300">{comment.content}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="p-4 bg-white/5 border-t border-white/5 flex gap-3">
                        <input value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Reply to signal..." className="flex-1 bg-transparent border-none outline-none text-white text-sm px-2" onKeyDown={(e) => e.key === 'Enter' && handlePostComment(selectedSignal.id)} />
                        <button onClick={() => handlePostComment(selectedSignal.id)} className="p-2 bg-white text-black rounded-full"><CornerDownRight className="w-4 h-4" /></button>
                    </div>
                </motion.div>
            </motion.div>
        )}

        {/* MISSION LIST MODAL */}
        {isMissionListOpen && (
            <motion.div initial={{ opacity: 0, x: 100 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 100 }} className="fixed top-0 right-0 h-full w-full md:w-96 bg-[#0a0a0a] border-l border-white/10 z-[150] shadow-2xl p-6 flex flex-col">
                <div className="flex justify-between items-center mb-8">
                    <h2 className="text-xl font-bold flex items-center gap-2"><Briefcase className="w-5 h-5 text-emerald-400" /> Missions</h2>
                    <div className="flex gap-2">
                        <button onClick={() => setIsMissionModalOpen(true)} className="p-2 bg-white text-black rounded-full"><Plus className="w-4 h-4" /></button>
                        <button onClick={() => setIsMissionListOpen(false)} className="p-2 hover:bg-white/10 rounded-full"><X className="w-5 h-5" /></button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar">
                    {missions.map((mission) => (
                        <div key={mission.id} onClick={() => setSelectedMission(mission)} className="p-4 rounded-xl bg-white/5 border border-white/5 hover:border-emerald-500/50 cursor-pointer transition-all">
                            <div className="flex justify-between mb-2"><span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 uppercase font-bold">{mission.type}</span><span className="text-[10px] text-zinc-500">{new Date(mission.created_at).toLocaleDateString()}</span></div>
                            <h3 className="font-bold text-sm mb-1">{mission.title}</h3>
                            <div className="text-xs font-mono text-zinc-400">{mission.budget}</div>
                        </div>
                    ))}
                </div>
            </motion.div>
        )}

        {/* MISSION EKLEME MODALI */}
        {isMissionModalOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="w-full max-w-md bg-[#0c0c0c] border border-white/10 rounded-2xl p-6">
                    <div className="flex justify-between mb-6"><h3 className="font-bold">New Mission</h3><button onClick={() => setIsMissionModalOpen(false)}><X className="w-5 h-5" /></button></div>
                    <div className="space-y-4">
                        <input placeholder="Title" value={newMission.title} onChange={e => setNewMission({...newMission, title: e.target.value})} className="w-full bg-white/5 p-3 rounded-xl border border-white/10 outline-none focus:border-white/30" />
                        <div className="flex gap-2">
                            <select className="bg-white/5 p-3 rounded-xl border border-white/10 outline-none flex-1" onChange={e => setNewMission({...newMission, type: e.target.value as any})}><option value="partner" className="bg-black">Partner</option><option value="paid" className="bg-black">Paid</option></select>
                            <input placeholder="Budget" className="bg-white/5 p-3 rounded-xl border border-white/10 outline-none flex-1" onChange={e => setNewMission({...newMission, budget: e.target.value})} />
                        </div>
                        <textarea placeholder="Description" className="w-full bg-white/5 p-3 rounded-xl border border-white/10 outline-none h-24" onChange={e => setNewMission({...newMission, description: e.target.value})} />
                        <input placeholder="Contact Email" className="w-full bg-white/5 p-3 rounded-xl border border-white/10 outline-none" onChange={e => setNewMission({...newMission, contact_email: e.target.value})} />
                        <button onClick={handleCreateMission} className="w-full bg-white text-black font-bold py-3 rounded-xl hover:bg-zinc-200">{isPostingMission ? "..." : "Post Mission"}</button>
                    </div>
                </div>
            </motion.div>
        )}

        {/* MISSION DETAY */}
        {selectedMission && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[210] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSelectedMission(null)}>
                <div className="w-full max-w-lg bg-[#0c0c0c] border border-white/10 rounded-2xl p-8 relative" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setSelectedMission(null)} className="absolute top-4 right-4"><X className="w-5 h-5" /></button>
                    <h2 className="text-2xl font-bold mb-2">{selectedMission.title}</h2>
                    <div className="text-emerald-400 font-mono text-sm mb-6">{selectedMission.budget} • {selectedMission.type}</div>
                    <p className="text-zinc-300 leading-relaxed mb-6">{selectedMission.description}</p>
                    <div className="p-4 bg-white/5 rounded-xl text-sm break-all font-mono text-zinc-400">{renderContactInfo(selectedMission.contact_info)}</div>
                </div>
            </motion.div>
        )}

        {/* DAILY FREQUENCY MODAL */}
        {isDailyOpen && dailyQuestion && (
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setIsDailyOpen(false)}>
                <div className="w-full max-w-3xl bg-[#0a0a0a] border border-blue-500/30 rounded-3xl overflow-hidden flex flex-col max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
                    <div className="p-6 bg-blue-900/10 border-b border-white/5"><h2 className="text-xl font-serif italic">"{dailyQuestion.content}"</h2></div>
                    <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                        {dailyResponses.map((res) => (
                            <div key={res.id} className="bg-white/5 p-4 rounded-xl"><div className="text-xs font-bold text-zinc-400 mb-1">@{res.author}</div><p className="text-zinc-200">{res.content}</p></div>
                        ))}
                    </div>
                    <div className="p-4 border-t border-white/5 flex gap-2"><input className="flex-1 bg-white/5 rounded-full px-4 outline-none" value={dailyResponseText} onChange={e => setDailyResponseText(e.target.value)} placeholder="Answer..." /><button onClick={handleDailyResponse} className="p-2 bg-white text-black rounded-full"><CornerDownRight className="w-4 h-4" /></button></div>
                </div>
             </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}