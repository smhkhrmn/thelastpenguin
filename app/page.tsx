"use client";

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { 
  Radio, X, MessageSquare, Send, 
  ChevronLeft, ChevronRight, RefreshCw, User, CornerDownRight, ChevronDown, 
  LogIn, LogOut, Search, LayoutGrid, Layers, Plus, Reply, Sparkles, Globe, 
  Briefcase, DollarSign, Calendar, Mail, Maximize2, AtSign, Video, Instagram, 
  List, Grid, Podcast, Zap, Sidebar, Boxes
} from "lucide-react";

import LavaBackground from '@/components/LavaBackground';
import ProfileSetup from '@/components/ProfileSetup';

import { SignalData, MissionData, FREQUENCIES } from "@/types";
import SignalCard from "@/components/lighthouse/SignalCard";
import WriteModal from "@/components/modals/WriteModal";

// --- ÇEVİRİ & YARDIMCI FONKSİYONLAR ---
const translateText = async (text: string) => {
    if (!text || text.length > 500) return text;
    try {
        const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=Autodetect|en`);
        const data = await response.json();
        return (data.responseStatus !== 200 || data.responseData.translatedText.includes("SELECT TWO DISTINCT LANGUAGES")) ? text : data.responseData.translatedText;
    } catch (error) { return text; }
};

const getFrequencyColor = (freqId: string) => {
    const freq = FREQUENCIES.find(f => f.id === freqId);
    return freq ? freq.color.replace('bg-', 'text-') : 'text-zinc-400';
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
  const [viewMode, setViewMode] = useState<'stack' | 'log'>('stack'); 
  const [missionViewMode, setMissionViewMode] = useState<'cards' | 'list'>('cards');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterFreq, setFilterFreq] = useState("all");
  const [isGlobalEnglish, setIsGlobalEnglish] = useState(false);
  const [translatedIDs, setTranslatedIDs] = useState<{[key: number]: boolean}>({});

  // Modallar ve Paneller
  const [isDailyOpen, setIsDailyOpen] = useState(false);
  const [isMissionModalOpen, setIsMissionModalOpen] = useState(false);
  const [isMissionListOpen, setIsMissionListOpen] = useState(false); // Mobil ve Desktop için ortak
  const [selectedMission, setSelectedMission] = useState<MissionData | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isWriting, setIsWriting] = useState(false);

  // Form
  const [selectedFreq, setSelectedFreq] = useState(FREQUENCIES[1]);
  const [messageText, setMessageText] = useState("");
  const [dailyResponseText, setDailyResponseText] = useState(""); 
  const [isSending, setIsSending] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [showAllComments, setShowAllComments] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [newMission, setNewMission] = useState({ title: '', type: 'partner' as 'partner' | 'paid', description: '', budget: '', contact_email: '', contact_skype: '', contact_insta: '' });
  const [isPostingMission, setIsPostingMission] = useState(false);

  // --- EFFECTLER ---
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

  useEffect(() => { setCurrentIndex(0); fetchSignals(); }, [filterFreq]);

  // Çeviri ve Realtime (Kısaltılmış)
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'signals' }, () => { fetchSignals(); if (dailyQuestion && isDailyOpen) fetchDailyResponses(dailyQuestion.id); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'missions' }, () => fetchSignals())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments' }, (payload) => {
          if (profile && payload.new.reply_to === profile.username && payload.new.author !== profile.username) {
             addNotification(`Log update: @${payload.new.author} replied to you! 💬`);
          }
          fetchSignals();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'likes' }, (payload) => { handleNewLikeNotification(payload.new); fetchSignals(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile, isDailyOpen, dailyQuestion]);

  // --- FONKSİYONLAR (Kısaltılmış - Mantık aynı) ---
  const addNotification = (message: string) => {
      const newNotif = { id: Date.now(), message };
      setNotifications(prev => [newNotif, ...prev]);
      setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== newNotif.id)), 6000);
  };

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (!error && data) { setProfile(data); if (!data.is_setup_complete) setShowSetup(true); }
  };

  const fetchSignals = async () => {
    if (signals.length === 0) setIsLoading(true);
    let query = supabase.from('signals').select('*, comments(*), likes(*)').order('created_at', { ascending: false });
    if (filterFreq !== 'all') query = query.eq('frequency', filterFreq);
    const { data, error } = await query;

    if (!error && data) {
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
        const activeMissions = missionData.filter((m: any) => new Date(m.created_at) > oneWeekAgo);
        setMissions(activeMissions as MissionData[]);
    }
    setIsLoading(false);
  };

  const fetchDailyResponses = async (questionId: number) => {
      const { data, error } = await supabase.from('signals').select('*, comments(*), likes(*)').eq('daily_question_id', questionId).order('created_at', { ascending: false });
      if (!error && data) {
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
    if (!error) { setMessageText(""); setIsWriting(false); setCurrentIndex(0); await fetchSignals(); }
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
      if (!error) { setCommentText(""); setReplyingTo(null); await fetchSignals(); setShowAllComments(true); if (dailyQuestion && isDailyOpen) fetchDailyResponses(dailyQuestion.id); }
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

  const initiateReply = (username: string) => { setReplyingTo(username); if (inputRef.current) inputRef.current.focus(); };

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

  const filteredSignals = signals.filter(s => s.content.toLowerCase().includes(searchQuery.toLowerCase()) || s.author.toLowerCase().includes(searchQuery.toLowerCase()) || (s.translation && s.translation.toLowerCase().includes(searchQuery.toLowerCase())));
  const nextSignal = () => setCurrentIndex((prev) => (prev + 1) % filteredSignals.length);
  const prevSignal = () => setCurrentIndex((prev) => (prev - 1 + filteredSignals.length) % filteredSignals.length);
  const currentSignal = filteredSignals.length > 0 ? filteredSignals[currentIndex] : null;

  const handleDragEnd = (event: any, info: PanInfo) => { if (info.offset.x < -100) nextSignal(); else if (info.offset.x > 100) prevSignal(); };
  
  const getCardStyle = (index: number) => {
    const total = filteredSignals.length;
    let dist = (index - currentIndex + total) % total;
    if (dist > total / 2) dist -= total;
    if (dist === 0) return { zIndex: 30, x: 0, scale: 1, opacity: 1, filter: "blur(0px)", display: "block" };
    if (dist === 1) return { zIndex: 20, x: 350, scale: 0.85, opacity: 0.5, filter: "blur(4px)", display: "block" };
    if (dist === -1) return { zIndex: 20, x: -350, scale: 0.85, opacity: 0.5, filter: "blur(4px)", display: "block" };
    return { zIndex: -1, x: 0, opacity: 0, display: "none" };
  };

  // --- RENDER ---
  return (
    <div className="relative h-screen w-full bg-black text-white font-sans overflow-hidden selection:bg-emerald-500/30">
      <LavaBackground />
      {showSetup && user && ( <ProfileSetup userId={user.id} onComplete={() => { setShowSetup(false); fetchProfile(user.id); }} /> )}

      {/* NOTIFICATIONS (TOAST) */}
      <div className="fixed top-24 right-8 z-[110] flex flex-col gap-3 pointer-events-none">
        <AnimatePresence>
          {notifications.map((notif) => (
            <motion.div key={notif.id} initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="bg-blue-500/20 backdrop-blur-xl border border-blue-500/30 px-4 py-3 rounded-xl shadow-[0_0_20px_rgba(59,130,246,0.2)] flex items-center gap-3">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
              <span className="text-xs font-bold text-blue-100">{notif.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* HEADER (HUD TOP BAR) */}
      <header className={`fixed top-0 left-0 right-0 z-50 p-4 md:p-6 flex justify-between items-center bg-gradient-to-b from-black/90 via-black/50 to-transparent backdrop-blur-sm transition-all duration-500 ${isWriting || showSetup ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}>
        <div className="flex items-center gap-4 cursor-pointer group" onClick={() => window.location.reload()}>
            <div className="relative">
                <div className="absolute inset-0 bg-emerald-500/30 blur-lg rounded-full group-hover:bg-emerald-500/50 transition-all" />
                <Zap className="w-8 h-8 text-white relative z-10" />
            </div>
            <div>
                <h1 className="text-lg font-bold tracking-tighter leading-none text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-400">THE LAST PENGUIN</h1>
                <span className="text-[8px] text-emerald-500/70 tracking-[0.3em] uppercase font-mono">Frequency Scanner Active</span>
            </div>
        </div>
        
        <div className="flex items-center gap-3 md:gap-6">
            {/* Desktop Search & View Controls */}
            <div className="hidden md:flex items-center gap-3 bg-white/5 border border-white/10 rounded-full p-1 pr-4 focus-within:border-emerald-500/50 transition-all backdrop-blur-md shadow-lg">
                <div className="flex p-1 bg-black/30 rounded-full">
                    <button onClick={() => setViewMode('stack')} className={`p-1.5 rounded-full transition-all ${viewMode === 'stack' ? 'bg-white/20 text-white' : 'text-zinc-500 hover:text-white'}`}><Layers className="w-4 h-4" /></button>
                    <button onClick={() => setViewMode('log')} className={`p-1.5 rounded-full transition-all ${viewMode === 'log' ? 'bg-white/20 text-white' : 'text-zinc-500 hover:text-white'}`}><LayoutGrid className="w-4 h-4" /></button>
                </div>
                <Search className="w-4 h-4 text-zinc-500" />
                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="SCAN FREQUENCIES..." className="bg-transparent border-none outline-none text-xs w-32 lg:w-48 text-white placeholder:text-zinc-600 font-mono" />
            </div>
            
            {/* Mobile Controls */}
            <div className="flex md:hidden gap-2">
                 <button onClick={() => setIsGlobalEnglish(!isGlobalEnglish)} className={`p-2 rounded-full border backdrop-blur-md transition-all ${isGlobalEnglish ? 'bg-white/20 text-white border-white/30' : 'text-zinc-400 bg-white/5 border-white/10'}`}><Globe className="w-5 h-5" /></button>
                 <button onClick={() => setIsMissionListOpen(!isMissionListOpen)} className={`p-2 rounded-full backdrop-blur-md border transition-all ${isMissionListOpen ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'text-zinc-400 bg-white/5 border-white/10'}`}><Briefcase className="w-5 h-5" /></button>
            </div>

            {/* User Profile */}
            {user ? (
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 pl-3 pr-1 py-1 rounded-full backdrop-blur-md shadow-lg group hover:border-white/20 transition-all">
                    <button onClick={() => setIsGlobalEnglish(!isGlobalEnglish)} className={`hidden md:block p-1.5 rounded-full transition-all ${isGlobalEnglish ? 'text-white' : 'text-zinc-500 hover:text-white'}`}><Globe className="w-4 h-4" /></button>
                    <span className="hidden md:block text-xs font-bold text-zinc-300 group-hover:text-white transition-colors cursor-pointer" onClick={() => router.push(`/profile/${encodeURIComponent(profile?.username || user.id)}`)}>{profile?.username || 'Explorer'}</span>
                    <img src={user.user_metadata.avatar_url} className="w-8 h-8 rounded-full border border-white/20 cursor-pointer group-hover:scale-105 transition-transform" onClick={() => router.push(`/profile/${encodeURIComponent(profile?.username || user.id)}`)} />
                    <button onClick={() => supabase.auth.signOut()} className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors"><LogOut className="w-4 h-4" /></button>
                </div>
            ) : ( 
                <button onClick={() => supabase.auth.signInWithOAuth({ provider: 'google' })} className="bg-white/10 border border-white/20 text-white px-5 py-2 rounded-full text-xs font-bold uppercase hover:bg-white/20 hover:scale-105 transition-all shadow-lg backdrop-blur-md">ENGAGE LOGIN</button> 
            )}
        </div>
      </header>

      {/* MAIN SCANNER VIEW (CENTER) */}
      <main className={`relative z-10 w-full h-full flex flex-col justify-center items-center transition-all duration-700 ${isExpanded || isWriting || showSetup || isDailyOpen || isMissionModalOpen || (isMissionListOpen && window.innerWidth < 1024) || selectedMission ? 'scale-95 opacity-50 pointer-events-none blur-sm' : 'scale-100 opacity-100'}`}>
        
        {/* Scanner Interface Container */}
        <div className="w-full max-w-2xl px-4 flex flex-col items-center mt-20 md:mt-24 2xl:mt-0 2xl:scale-110 transition-transform duration-500 origin-center relative">
            
            {/* 1. DAILY FREQUENCY BANNER (HUD Style) */}
            {!isLoading && dailyQuestion && (
                <motion.button initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="relative z-40 w-full max-w-xl mb-8 flex items-stretch overflow-hidden rounded-2xl border border-blue-500/30 bg-black/60 backdrop-blur-xl shadow-[0_0_30px_-10px_rgba(59,130,246,0.3)] cursor-pointer group hover:border-blue-400/50 transition-all" onClick={() => { if(dailyQuestion) { fetchDailyResponses(dailyQuestion.id); setIsDailyOpen(true); } }}>
                    <div className="bg-blue-500/20 px-4 flex items-center justify-center border-r border-blue-500/30 group-hover:bg-blue-500/30 transition-colors">
                        <Sparkles className="w-5 h-5 text-blue-300 animate-pulse" />
                    </div>
                    <div className="flex-1 p-3 flex flex-col justify-center overflow-hidden">
                        <div className="text-[9px] font-bold text-blue-400 uppercase tracking-[0.2em] mb-1 font-mono">Incoming Transmission: Daily Frequency</div>
                        <div className="text-sm md:text-base font-serif italic text-zinc-100 truncate relative z-10">"{dailyQuestion.content}"</div>
                        {/* Scanline effect */}
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-500/5 to-transparent bg-[length:100%_3px] animate-scanline pointer-events-none opacity-50"></div>
                    </div>
                    <div className="px-4 flex items-center justify-center border-l border-white/5 bg-white/5 text-xs font-bold uppercase tracking-widest text-zinc-400 group-hover:text-white group-hover:bg-white/10 transition-all">OPEN LOG</div>
                </motion.button>
            )}

            {/* 2. FREQUENCY TUNER (Categories) */}
            <div className="mb-8 flex justify-center w-full">
                <div className="flex bg-black/60 backdrop-blur-xl border border-white/10 p-1.5 rounded-full gap-1 shadow-2xl relative overflow-hidden">
                    {FREQUENCIES.map((freq) => (
                        <button key={freq.id} onClick={() => setFilterFreq(freq.id)} className={`relative z-10 px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2 ${filterFreq === freq.id ? 'bg-white text-black shadow-lg scale-105' : 'text-zinc-500 hover:text-white hover:bg-white/5'}`}>
                            {freq.id !== 'all' && ( <div className={`w-2 h-2 rounded-full ${freq.color} shadow-[0_0_10px] ${freq.color.replace('bg-', 'shadow-')}`} /> )}
                            {freq.name}
                        </button>
                    ))}
                    {/* Active indicator glow */}
                    <div className="absolute inset-0 bg-white/5 blur-xl rounded-full pointer-events-none"></div>
                </div>
            </div>

            {/* 3. SCANNER VIEWPORT (Cards) */}
            {isLoading ? ( <div className="flex flex-col items-center gap-4 animate-pulse py-20"><RefreshCw className="w-10 h-10 animate-spin text-emerald-500" /><span className="text-xs text-emerald-500 tracking-[0.3em] font-mono">INITIALIZING SCAN...</span></div> ) : filteredSignals.length > 0 ? (
                viewMode === 'stack' ? (
                    <div className="relative w-full max-w-md md:max-w-xl lg:max-w-2xl h-[350px] md:h-[450px] flex items-center justify-center perspective-1000">
                        {/* Holographic base projector effect */}
                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-4 bg-emerald-500/20 blur-xl rounded-full" />
                        
                        {filteredSignals.map((signal, index) => (
                           <SignalCard key={signal.id} signal={signal} style={getCardStyle(index)} user={user} onDragEnd={handleDragEnd} onExpand={() => { if(index === currentIndex) setIsExpanded(true); }} onLike={handleSendSignal} onTranslate={handleTranslate} isTranslated={translatedIDs[signal.id]} isGlobalEnglish={isGlobalEnglish} />
                        ))}
                        
                        {/* Controls Bar */}
                        <div className="absolute -bottom-20 flex items-center gap-6 bg-black/60 backdrop-blur-xl border border-white/10 p-2 px-6 rounded-full shadow-2xl z-30">
                            <button onClick={prevSignal} className="p-3 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-all active:scale-90"><ChevronLeft className="w-6 h-6" /></button>
                            <div className="w-px h-6 bg-white/10"></div>
                            <button onClick={() => setIsWriting(true)} className="group relative p-1">
                                <div className="absolute inset-0 bg-white/30 blur-md rounded-full group-hover:bg-white/50 transition-all" />
                                <div className="relative w-14 h-14 bg-white text-black rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-transform"><Podcast className="w-6 h-6 animate-pulse" /></div>
                            </button>
                            <div className="w-px h-6 bg-white/10"></div>
                            <button onClick={nextSignal} className="p-3 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-all active:scale-90"><ChevronRight className="w-6 h-6" /></button>
                        </div>
                    </div>
                ) : (
                    <div className="w-full h-[55vh] overflow-y-auto overflow-x-hidden px-2 custom-scrollbar pb-20 mask-image-b">
                        <div className="grid gap-3"> 
                            {filteredSignals.map((signal, index) => (
                                <motion.div key={signal.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} className={`flex items-start gap-4 p-5 bg-black/40 backdrop-blur-md border border-white/5 rounded-2xl hover:border-white/20 hover:bg-white/5 transition-all group cursor-pointer relative overflow-hidden`} onClick={() => { setCurrentIndex(index); setIsExpanded(true); }}>
                                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${getFrequencyColor(signal.frequency).replace('text-', 'bg-')}/50`}></div>
                                    <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-white/10 overflow-hidden shrink-0 mt-1"><img src={signal.author_avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${signal.author}`} className="w-full h-full object-cover" /></div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-baseline mb-1">
                                            <span className="text-xs font-bold text-zinc-300 truncate hover:text-white transition-colors" onClick={(e) => { e.stopPropagation(); router.push(`/profile/${signal.author}`); }}>@{signal.author}</span>
                                            <span className="text-[10px] font-mono text-zinc-600">{new Date(signal.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                        </div>
                                        <p className="text-sm text-zinc-300 leading-relaxed line-clamp-3 break-words font-serif">"{renderText(signal)}"</p>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                )
            ) : <div className="text-center opacity-50 py-20"><h2 className="text-xl font-serif text-zinc-500">Static... The void is silent.</h2><button onClick={() => setIsWriting(true)} className="mt-4 text-emerald-400 hover:text-emerald-300 underline underline-offset-4 font-bold font-mono uppercase tracking-widest">Initiate Broadcast</button></div>}
        </div>
      </main>

      {/* MISSION BOARD SIDEBAR (Desktop - Right) */}
      <div className={`hidden lg:flex flex-col w-72 2xl:w-80 h-[calc(100vh-8rem)] fixed right-6 top-28 z-40 transition-all duration-500 ${isExpanded || isWriting || isDailyOpen || selectedMission ? 'translate-x-full opacity-0' : 'translate-x-0 opacity-100'}`}>
          <div className="w-full h-full bg-black/60 backdrop-blur-xl border border-white/10 rounded-3xl p-5 flex flex-col overflow-hidden relative shadow-2xl">
              <div className="flex justify-between items-center mb-4 pb-4 border-b border-white/5">
                  <div className="flex items-center gap-2 text-xs font-bold text-zinc-400 uppercase tracking-widest"><Briefcase className="w-4 h-4 text-emerald-400" /> Active Missions</div>
                  <button onClick={() => setIsMissionModalOpen(true)} className="p-2 bg-white/5 hover:bg-white/10 text-white rounded-full transition-all shadow-lg"><Plus className="w-4 h-4" /></button>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-1 mask-image-b">
                  {missions.length > 0 ? missions.map((mission) => (
                      <div key={mission.id} className={`bg-black/40 border border-white/5 p-4 rounded-2xl hover:border-white/30 hover:bg-white/5 transition-all cursor-pointer group relative overflow-hidden`} onClick={() => setSelectedMission(mission)}>
                          <div className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-${mission.type === 'paid' ? 'emerald' : 'blue'}-500/10 to-transparent -mr-10 -mt-10 rounded-full blur-xl pointer-events-none`}></div>
                          <div className="flex justify-between items-start mb-2 relative z-10">
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${mission.type === 'paid' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'} uppercase tracking-wider`}>{mission.type}</span>
                              <span className="text-[9px] text-zinc-600 font-mono">{new Date(mission.created_at).toLocaleDateString()}</span>
                          </div>
                          <h4 className="text-sm font-bold text-white leading-tight mb-2 truncate relative z-10 group-hover:underline">{mission.title}</h4>
                          <div className="flex justify-between items-center text-[10px] font-mono text-zinc-500 relative z-10">
                              <span className={mission.type === 'paid' ? 'text-emerald-400' : 'text-blue-400'}>{mission.budget}</span>
                              <ChevronRight className="w-3 h-3 text-zinc-600 group-hover:text-white transition-colors" />
                          </div>
                      </div>
                  )) : <div className="text-center text-zinc-700 text-xs mt-20 italic font-mono">No missions detectable.<br/>Be the first to deploy.</div>}
              </div>
          </div>
      </div>

      {/* MOBILE LOG VIEW BUTTON */}
      {viewMode === 'log' && (
        <button onClick={() => setIsWriting(true)} className="fixed bottom-8 right-8 z-50 w-14 h-14 bg-white text-black rounded-full flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-all md:hidden">
            <Podcast className="w-6 h-6 animate-pulse" />
        </button>
      )}

      <AnimatePresence>
        <WriteModal isOpen={isWriting} onClose={() => setIsWriting(false)} messageText={messageText} setMessageText={setMessageText} onBroadcast={handleBroadcast} isSending={isSending} selectedFreq={selectedFreq} setSelectedFreq={setSelectedFreq} />
        
        {/* MISSION EKLEME MODALI (HUD STİLİ) */}
        {isMissionModalOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={() => setIsMissionModalOpen(false)}>
                <motion.div initial={{ scale: 0.95, y: 30 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-lg bg-[#0a0a0a] border border-emerald-500/30 rounded-3xl overflow-hidden flex flex-col shadow-[0_0_50px_-10px_rgba(52,211,153,0.2)] relative" onClick={(e) => e.stopPropagation()}>
                    <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))] opacity-10 pointer-events-none"></div>
                    <div className="p-6 border-b border-white/10 bg-emerald-900/10 flex justify-between items-center relative z-10">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2 uppercase tracking-wider"><Briefcase className="w-5 h-5 text-emerald-400" /> Deploy New Mission</h2>
                        <button onClick={() => setIsMissionModalOpen(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors"><X className="w-5 h-5 text-white" /></button>
                    </div>
                    <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto custom-scrollbar relative z-10">
                        <div>
                            <label className="text-[10px] text-zinc-500 uppercase font-bold pl-1 mb-1 block">Mission Protocol (Title)</label>
                            <input value={newMission.title} onChange={e => setNewMission({...newMission, title: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white outline-none focus:border-emerald-500/50 text-sm font-mono" placeholder="e.g. Operation Deep Dive" />
                        </div>
                        <div className="flex gap-4">
                            <div className="flex-1">
                                <label className="text-[10px] text-zinc-500 uppercase font-bold pl-1 mb-1 block">Contract Type</label>
                                <select value={newMission.type} onChange={e => setNewMission({...newMission, type: e.target.value as any})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white outline-none text-sm appearance-none font-mono"><option value="partner" className="bg-black">Partner Connection</option><option value="paid" className="bg-black">Paid Bounty</option></select>
                            </div>
                            <div className="flex-1">
                                <label className="text-[10px] text-zinc-500 uppercase font-bold pl-1 mb-1 block">Allocation (Budget)</label>
                                <input value={newMission.budget} onChange={e => setNewMission({...newMission, budget: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white outline-none focus:border-emerald-500/50 text-sm font-mono" placeholder="e.g. 500 Credits / 10% Equity" />
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] text-zinc-500 uppercase font-bold pl-1 mb-1 block">Mission Briefing</label>
                            <textarea value={newMission.description} onChange={e => setNewMission({...newMission, description: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white h-24 resize-none outline-none focus:border-emerald-500/50 text-sm font-mono" placeholder="Describe objectives and requirements..." />
                        </div>
                        <div>
                            <label className="text-[10px] text-zinc-500 uppercase font-bold pl-1 mb-1 block">Comms Channel (Email)</label>
                            <input value={newMission.contact_email} onChange={e => setNewMission({...newMission, contact_email: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white outline-none focus:border-emerald-500/50 text-sm font-mono" placeholder="secure@frequency.com" />
                        </div>
                    </div>
                    <div className="p-6 border-t border-white/10 bg-black/40 relative z-10"><button onClick={handleCreateMission} disabled={isPostingMission || !newMission.title || !newMission.contact_email} className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/20 uppercase tracking-widest text-sm">{isPostingMission ? <RefreshCw className="w-4 h-4 animate-spin" /> : "INITIATE MISSION DEPLOYMENT"}</button></div>
                </motion.div>
            </motion.div>
        )}

        {/* MISSION LIST SIDEBAR (Mobil) */}
        <AnimatePresence>
        {isMissionListOpen && (
            <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[140] bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setIsMissionListOpen(false)} />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="fixed inset-y-0 right-0 w-full max-w-xs bg-[#0a0a0a] border-l border-white/10 z-[150] shadow-2xl p-6 flex flex-col lg:hidden">
                <div className="flex justify-between items-center mb-8 pb-4 border-b border-white/10">
                    <h2 className="text-lg font-bold flex items-center gap-2 uppercase tracking-wider"><Briefcase className="w-5 h-5 text-emerald-400" /> Mission Log</h2>
                    <div className="flex gap-2">
                        <button onClick={() => setIsMissionModalOpen(true)} className="p-2 bg-white text-black rounded-full shadow-lg"><Plus className="w-4 h-4" /></button>
                        <button onClick={() => setIsMissionListOpen(false)} className="p-2 hover:bg-white/10 rounded-full"><X className="w-5 h-5 text-white" /></button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1">
                    {missions.length > 0 ? missions.map((mission) => (
                        <div key={mission.id} onClick={() => { setIsMissionListOpen(false); setSelectedMission(mission); }} className="p-4 rounded-xl bg-white/5 border border-white/5 hover:border-emerald-500/50 cursor-pointer transition-all active:scale-95">
                            <div className="flex justify-between mb-2"><span className={`text-[9px] px-2 py-0.5 rounded border uppercase font-bold tracking-wider ${mission.type === 'paid' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>{mission.type}</span><span className="text-[9px] text-zinc-500 font-mono">{new Date(mission.created_at).toLocaleDateString()}</span></div>
                            <h3 className="font-bold text-sm mb-1 text-white">{mission.title}</h3>
                            <div className="text-xs font-mono text-zinc-400">{mission.budget}</div>
                        </div>
                    )) : <div className="text-center text-zinc-600 text-xs mt-20 font-mono">No missions found.</div>}
                </div>
            </motion.div>
            </>
        )}
        </AnimatePresence>

        {/* MISSION DETAILS MODAL (HUD Stili) */}
        {selectedMission && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={() => setSelectedMission(null)}>
                <motion.div initial={{ scale: 0.95, y: 30 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-lg bg-[#0a0a0a] border border-emerald-500/30 rounded-3xl overflow-hidden flex flex-col shadow-2xl max-h-[85vh] relative" onClick={(e) => e.stopPropagation()}>
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-emerald-500 to-blue-500"></div>
                    <div className="p-6 border-b border-white/10 bg-emerald-900/10 flex justify-between items-start shrink-0 relative">
                        <div className="pr-10">
                            <span className={`text-[9px] font-bold px-2 py-1 rounded uppercase tracking-[0.2em] border ${selectedMission.type === 'paid' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>{selectedMission.type === 'paid' ? 'PAID CONTRACT' : 'PARTNER REQUEST'}</span>
                            <h2 className="text-xl font-bold text-white mt-3 leading-tight break-words font-mono">{selectedMission.title}</h2>
                        </div>
                        <button onClick={() => setSelectedMission(null)} className="absolute top-4 right-4 p-2 bg-white/5 rounded-full hover:bg-white/10 shrink-0"><X className="w-5 h-5 text-white" /></button>
                    </div>
                    <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar bg-black/40">
                        <div className="group p-4 rounded-xl bg-white/5 border border-white/5 relative overflow-hidden">
                             <div className="absolute inset-0 bg-emerald-500/5 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <div className="text-[9px] text-zinc-400 uppercase font-bold mb-2 flex items-center gap-2 tracking-widest"><Briefcase className="w-3 h-3 text-emerald-400" /> Mission Brief</div>
                            <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap font-mono">{selectedMission.description}</p>
                        </div>
                        <div className="flex gap-4">
                            <div className="flex-1 bg-white/5 rounded-xl p-4 border border-white/5 font-mono">
                                <div className="text-[9px] text-zinc-500 uppercase font-bold mb-1 tracking-widest">Allocation</div>
                                <div className="text-sm text-emerald-400 font-bold">{selectedMission.budget}</div>
                            </div>
                            <div className="flex-1 bg-white/5 rounded-xl p-4 border border-white/5 font-mono">
                                <div className="text-[9px] text-zinc-500 uppercase font-bold mb-1 tracking-widest">Timestamp</div>
                                <div className="text-sm text-white">{new Date(selectedMission.created_at).toLocaleDateString()}</div>
                            </div>
                        </div>
                        <div className="bg-blue-500/10 border border-blue-500/20 p-5 rounded-xl relative overflow-hidden">
                            <div className="absolute -right-10 -bottom-10 text-blue-500/10"><Mail className="w-32 h-32" /></div>
                            <div className="text-[9px] text-blue-400 uppercase font-bold mb-3 flex items-center gap-2 tracking-widest relative z-10"><Zap className="w-3 h-3" /> Secure Comms Link</div>
                            <div className="text-sm text-white font-mono select-all cursor-pointer break-all relative z-10">{renderContactInfo(selectedMission.contact_info)}</div>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        )}

        {/* DAILY FREQUENCY MODAL (HUD Stili) */}
        {isDailyOpen && dailyQuestion && (
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={() => setIsDailyOpen(false)}>
                <motion.div initial={{ scale: 0.95, y: 30 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-4xl max-h-[90vh] bg-[#0a0a0a] border border-blue-500/30 rounded-3xl shadow-[0_0_50px_-10px_rgba(59,130,246,0.3)] overflow-hidden flex flex-col relative" onClick={(e) => e.stopPropagation()}>
                    <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))] opacity-10 pointer-events-none"></div>
                    <div className="p-6 md:p-8 border-b border-white/5 bg-blue-900/10 shrink-0 relative z-10">
                        <div className="flex justify-between items-start mb-4">
                            <div className="text-[10px] font-bold text-blue-400 uppercase tracking-[0.2em] flex items-center gap-2 font-mono"><Sparkles className="w-4 h-4 animate-pulse" /> Incoming Global Transmission</div>
                            <button onClick={() => setIsDailyOpen(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors"><X className="w-6 h-6 text-white" /></button>
                        </div>
                        <h2 className="text-2xl md:text-4xl font-serif text-white leading-tight italic text-center py-4 text-transparent bg-clip-text bg-gradient-to-r from-blue-200 via-white to-blue-200">"{dailyQuestion.content}"</h2>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-black/40 relative z-10">
                        <div className="space-y-4">
                            {dailyResponses.length > 0 ? dailyResponses.map((response) => (
                                <div key={response.id} className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 hover:bg-white/[0.06] transition-colors">
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-8 h-8 rounded-full bg-zinc-800 overflow-hidden border border-white/10"><img src={response.author_avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${response.author}`} className="w-full h-full" /></div>
                                        <div className="text-xs font-bold text-white font-mono">@{response.author}</div>
                                    </div>
                                    <p className="text-zinc-200 text-sm md:text-base leading-relaxed font-serif pl-11">"{renderText(response)}"</p>
                                </div>
                            )) : <div className="text-center py-20 opacity-30 text-sm uppercase tracking-[0.3em] font-mono animate-pulse">Awaiting First Response...</div>}
                        </div>
                    </div>
                    <div className="p-6 bg-[#0a0a0a] border-t border-white/5 shrink-0 flex gap-4 relative z-10">
                         <div className="flex-1 relative group">
                            <div className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                            <input type="text" value={dailyResponseText} onChange={(e) => setDailyResponseText(e.target.value)} placeholder="Transmit your answer..." className="w-full bg-white/5 border border-white/10 rounded-full py-4 px-6 text-sm text-white outline-none focus:border-blue-500/50 font-mono relative z-10 transition-all focus:bg-black" onKeyDown={(e) => e.key === 'Enter' && handleDailyResponse()} />
                            <button onClick={handleDailyResponse} disabled={isSending || !dailyResponseText.trim()} className="absolute right-2 top-1/2 -translate-y-1/2 p-3 bg-white text-black rounded-full hover:scale-110 transition-all z-20 disabled:opacity-50 disabled:hover:scale-100"><CornerDownRight className="w-5 h-5" /></button>
                         </div>
                    </div>
                </motion.div>
             </motion.div>
        )}

        {/* GENİŞLETİLMİŞ SİNYAL MODAL (HUD Stili) */}
        {isExpanded && !isWriting && currentSignal && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={() => setIsExpanded(false)}>
                <button onClick={(e) => { e.stopPropagation(); prevSignal(); }} className="hidden md:flex fixed left-8 z-[110] p-5 rounded-full bg-white/5 hover:bg-white/10 text-white transition-all border border-white/10 active:scale-90 backdrop-blur-md"><ChevronLeft className="w-8 h-8" /></button>
                <motion.div initial={{ scale: 0.95, y: 30 }} animate={{ scale: 1, y: 0 }} drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.4} onDragEnd={(e, info) => { if (info.offset.x < -100) nextSignal(); else if (info.offset.x > 100) prevSignal(); }} className={`relative w-full max-w-3xl max-h-[85vh] bg-[#0a0a0a] border border-white/10 rounded-3xl shadow-[0_0_60px_-15px_rgba(255,255,255,0.1)] overflow-hidden flex flex-col touch-none`} onClick={(e) => e.stopPropagation()}>
                    <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-${getFrequencyColor(currentSignal.frequency).replace('text-', '')}-500 to-transparent opacity-50`}></div>
                    <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/[0.02] shrink-0">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full border border-white/10 overflow-hidden bg-white/5 p-0.5"><img src={currentSignal.author_avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${currentSignal.author}`} className="w-full h-full object-cover rounded-full" /></div>
                            <div><h2 className="font-bold text-white text-base md:text-lg font-mono">@{currentSignal.author}</h2><p className={`text-[10px] uppercase tracking-widest font-bold ${getFrequencyColor(currentSignal.frequency)}`}>{currentSignal.frequency} Sector</p></div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={(e) => handleTranslate(e, currentSignal)} className={`p-2 rounded-full border transition-all ${translatedIDs[currentSignal.id] ? 'bg-white text-black border-white' : 'bg-transparent text-zinc-500 border-white/10 hover:text-white'}`}><Globe className="w-5 h-5" /></button>
                            <button onClick={() => setIsExpanded(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors"><X className="w-6 h-6 text-white" /></button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-8 md:p-10 custom-scrollbar bg-black/40">
                        <p className="text-xl md:text-3xl font-serif text-zinc-100 leading-relaxed whitespace-pre-wrap mb-12 mt-4 italic text-center">"{renderText(currentSignal)}"</p>
                        <div className="pt-8 border-t border-white/5">
                            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-[0.2em] mb-6 font-mono">Signal Logs ({currentSignal.comments?.length || 0})</h3>
                            <div className="space-y-6 pb-4">
                                {(showAllComments ? currentSignal.comments : currentSignal.comments?.slice(0, 2))?.map((comment: any) => (
                                    <div key={comment.id} className="flex gap-4 group pl-4 border-l-2 border-white/10 hover:border-white/30 transition-colors">
                                        <div className="w-8 h-8 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center shrink-0"><User className="w-4 h-4 text-zinc-400" /></div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-sm font-bold text-zinc-300 font-mono">@{comment.author}</span>
                                                <span className="text-[10px] text-zinc-600 font-mono">{new Date(comment.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                            </div>
                                            <p className="text-sm text-zinc-400 leading-relaxed font-serif">{comment.content}</p>
                                        </div>
                                    </div>
                                ))}
                                {!showAllComments && currentSignal.comments && currentSignal.comments.length > 2 && (
                                    <button onClick={() => setShowAllComments(true)} className="flex items-center gap-2 text-xs text-white hover:text-emerald-400 transition-colors mt-4 pl-12 uppercase tracking-widest font-bold font-mono"><span>Load More Logs</span><ChevronDown className="w-4 h-4" /></button>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="p-4 md:p-6 bg-[#0a0a0a] border-t border-white/5 shrink-0 relative z-10">
                        <div className="flex gap-3 items-center relative group">
                             <div className="absolute inset-0 bg-white/5 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/5 flex items-center justify-center shrink-0 border border-white/10 relative z-10"><User className="w-5 h-5 md:w-6 md:h-6 text-zinc-500" /></div>
                            <div className="flex-1 relative z-10">
                                <input ref={inputRef} type="text" value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Transmit a reply..." className="w-full bg-white/5 border border-white/10 rounded-full py-3 md:py-4 px-6 text-sm text-white outline-none focus:border-white/30 pr-14 font-mono transition-all focus:bg-black" onKeyDown={(e) => e.key === 'Enter' && handlePostComment(currentSignal.id)} />
                                <button onClick={() => handlePostComment(currentSignal.id)} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 md:p-3 bg-white text-black rounded-full hover:scale-110 transition-all"><CornerDownRight className="w-5 h-5 md:w-6 md:h-6" /></button>
                            </div>
                        </div>
                    </div>
                </motion.div>
                <button onClick={(e) => { e.stopPropagation(); nextSignal(); }} className="hidden md:flex fixed right-8 z-[110] p-5 rounded-full bg-white/5 hover:bg-white/10 text-white transition-all border border-white/10 active:scale-90 backdrop-blur-md"><ChevronRight className="w-8 h-8" /></button>
            </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}