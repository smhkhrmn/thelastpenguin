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
  List, Grid, Podcast
} from "lucide-react";

import LavaBackground from '@/components/LavaBackground';
import ProfileSetup from '@/components/ProfileSetup';

// --- AYRILMIŞ BİLEŞENLER VE TİPLER ---
import { SignalData, MissionData, FREQUENCIES } from "@/types";
import SignalCard from "@/components/lighthouse/SignalCard";
import WriteModal from "@/components/modals/WriteModal";

// --- YARDIMCI FONKSİYONLAR ---
const translateText = async (text: string) => {
    if (!text || text.length > 500) return text;
    try {
        const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=Autodetect|en`);
        const data = await response.json();
        if (data.responseStatus !== 200 || data.responseData.translatedText.includes("SELECT TWO DISTINCT LANGUAGES")) {
            return text;
        }
        return data.responseData.translatedText;
    } catch (error) {
        return text;
    }
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

  const [isDailyOpen, setIsDailyOpen] = useState(false);
  const [isMissionModalOpen, setIsMissionModalOpen] = useState(false);
  const [isMissionListOpen, setIsMissionListOpen] = useState(false);
  const [selectedMission, setSelectedMission] = useState<MissionData | null>(null);
  const [expandedBrief, setExpandedBrief] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isWriting, setIsWriting] = useState(false);

  const [selectedFreq, setSelectedFreq] = useState(FREQUENCIES[1]);
  const [messageText, setMessageText] = useState("");
  const [dailyResponseText, setDailyResponseText] = useState(""); 
  const [isSending, setIsSending] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [showAllComments, setShowAllComments] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [newMission, setNewMission] = useState({ 
      title: '', type: 'partner' as 'partner' | 'paid', description: '', budget: '', 
      contact_email: '', contact_skype: '', contact_insta: '' 
  });
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

  // --- FONKSİYONLAR ---
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
            return { 
                ...sig, author_avatar: p?.avatar_url, author_country: p?.country || sig.distance, author_occupation: p?.occupation || sig.role,
                comments: sig.comments ? sig.comments.sort((a:any, b:any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) : []
            };
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
  
  const getFrequencyColor = (freqId: string) => {
    const freq = FREQUENCIES.find(f => f.id === freqId);
    return freq ? `text-[${freq.color.replace('bg-', '')}] border-[${freq.color.replace('bg-', '')}]/50` : 'text-zinc-400 border-white/10';
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
  
  // DÜZELTİLMİŞ KART STİLİ (Üst üste binme sorunu çözüldü)
  const getCardStyle = (index: number) => {
    const total = filteredSignals.length;
    let dist = (index - currentIndex + total) % total;
    if (dist > total / 2) dist -= total;
    
    // Aktif Kart (Ortada, tam görünür)
    if (dist === 0) return { zIndex: 30, x: 0, scale: 1, opacity: 1, filter: "blur(0px)", display: "block" };
    
    // Sağdaki Kart (İyice sağa, flu)
    if (dist === 1) return { zIndex: 20, x: 350, scale: 0.85, opacity: 0.5, filter: "blur(4px)", display: "block" };
    
    // Soldaki Kart (İyice sola, flu)
    if (dist === -1) return { zIndex: 20, x: -350, scale: 0.85, opacity: 0.5, filter: "blur(4px)", display: "block" };
    
    // Diğerleri gizli
    return { zIndex: -1, x: 0, opacity: 0, display: "none" };
  };

  return (
    <div className="relative h-screen w-full bg-black text-white font-sans overflow-hidden selection:bg-white/20">
      <LavaBackground />
      {showSetup && user && ( <ProfileSetup userId={user.id} onComplete={() => { setShowSetup(false); fetchProfile(user.id); }} /> )}

      <div className="fixed top-24 right-8 z-[100] flex flex-col gap-3 pointer-events-none">
        <AnimatePresence>
          {notifications.map((notif) => (
            <motion.div key={notif.id} initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="bg-blue-600/20 backdrop-blur-xl border border-blue-500/30 px-6 py-3 rounded-2xl shadow-xl flex items-center gap-3">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
              <span className="text-xs font-bold text-blue-100">{notif.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <header className={`fixed top-0 left-0 right-0 z-50 p-6 md:p-8 flex flex-col md:flex-row justify-between items-start transition-all duration-500 ${isWriting || showSetup ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}>
        <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-start">
            <div className="flex flex-col cursor-pointer" onClick={() => window.location.reload()}>
                <h1 className="text-xl md:text-2xl font-bold tracking-tighter mix-blend-difference">The Last Penguin</h1>
                <span className="text-[9px] md:text-[10px] uppercase tracking-[0.3em] text-zinc-500 mt-1">Frequency Scanner v1.0</span>
            </div>
            <div className="flex md:hidden items-center gap-3">
                 <button onClick={() => setIsGlobalEnglish(!isGlobalEnglish)} className={`p-2 rounded-full border transition-all ${isGlobalEnglish ? 'bg-white text-black border-white' : 'text-zinc-400 bg-white/10 border-white/10'}`}><Globe className="w-4 h-4" /></button>
                 <button onClick={() => setIsMissionListOpen(true)} className="p-2 rounded-full bg-white/10 border border-white/10 text-emerald-400"><Briefcase className="w-4 h-4" /></button>
                 {user ? ( <img src={user.user_metadata.avatar_url} className="w-8 h-8 rounded-full border border-white/20 cursor-pointer" onClick={() => router.push(`/profile/${encodeURIComponent(profile?.username || user.id)}`)} /> ) : ( <button onClick={() => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` } })} className="p-2 bg-white text-black rounded-full"><LogIn className="w-4 h-4" /></button> )}
            </div>
        </div>
        <div className="hidden md:flex items-center gap-4">
            <div className="flex bg-white/5 border border-white/10 p-1 rounded-xl">
                <button onClick={() => setViewMode('stack')} className={`p-2 rounded-lg transition-all ${viewMode === 'stack' ? 'bg-white text-black' : 'text-zinc-500'}`}><Layers className="w-4 h-4" /></button>
                <button onClick={() => setViewMode('log')} className={`p-2 rounded-lg transition-all ${viewMode === 'log' ? 'bg-white text-black' : 'text-zinc-500'}`}><LayoutGrid className="w-4 h-4" /></button>
            </div>
            <div className="flex items-center bg-white/5 border border-white/10 rounded-full px-4 py-2 gap-3 focus-within:border-blue-500/50 transition-all">
                <Search className="w-3 h-3 text-zinc-500" />
                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Scan void..." className="bg-transparent border-none outline-none text-xs w-32" />
            </div>
            {user ? (
                <div className="flex items-center gap-3 bg-white/5 border border-white/10 px-4 py-2 rounded-full backdrop-blur-md">
                    <button onClick={() => setIsGlobalEnglish(!isGlobalEnglish)} className={`p-1.5 rounded-full border transition-all ${isGlobalEnglish ? 'bg-white text-black border-white' : 'text-zinc-400 border-white/10 hover:text-white'}`} title="Global Translate"><Globe className="w-4 h-4" /></button>
                    <img src={user.user_metadata.avatar_url} className="w-6 h-6 rounded-full border border-white/20 cursor-pointer hover:scale-110 transition-all" onClick={() => router.push(`/profile/${encodeURIComponent(profile?.username || user.id)}`)} />
                    <button onClick={() => supabase.auth.signOut()} className="ml-2 p-1 hover:text-red-400 transition-colors"><LogOut className="w-4 h-4" /></button>
                </div>
            ) : ( <button onClick={() => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` } })} className="flex items-center gap-2 bg-white text-black px-5 py-2 rounded-full text-xs font-bold tracking-widest uppercase hover:scale-105 transition-transform"><LogIn className="w-4 h-4" /> <span>Login</span></button> )}
        </div>
      </header>

      <main className={`relative z-10 w-full h-full pt-32 flex justify-center transition-all duration-700 ${isExpanded || isWriting || showSetup || isDailyOpen || isMissionModalOpen || isMissionListOpen || selectedMission ? 'scale-90 opacity-0 pointer-events-none blur-xl' : 'scale-100 opacity-100'}`}>
        <div className="w-full max-w-2xl px-4 flex flex-col items-center mx-auto">
            <div className="flex md:hidden w-full justify-end mb-4">
                <div className="flex bg-white/5 border border-white/10 p-1 rounded-xl">
                    <button onClick={() => setViewMode('stack')} className={`p-2 rounded-lg transition-all ${viewMode === 'stack' ? 'bg-white text-black' : 'text-zinc-500'}`}><Layers className="w-4 h-4" /></button>
                    <button onClick={() => setViewMode('log')} className={`p-2 rounded-lg transition-all ${viewMode === 'log' ? 'bg-white text-black' : 'text-zinc-500'}`}><LayoutGrid className="w-4 h-4" /></button>
                </div>
            </div>

            {!isLoading && dailyQuestion && (
                <motion.button initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="relative z-40 w-full max-w-xl mb-4 flex items-center justify-between p-3 px-5 rounded-full border bg-black/40 backdrop-blur-xl border-blue-500/20 shadow-[0_0_15px_-5px_rgba(59,130,246,0.2)] cursor-pointer hover:border-blue-500/40 transition-all touch-action-manipulation text-left" onClick={() => { if(dailyQuestion) { fetchDailyResponses(dailyQuestion.id); setIsDailyOpen(true); } }}>
                    <div className="flex items-center gap-3 overflow-hidden pointer-events-none">
                        <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 border border-blue-500/20"><Sparkles className="w-4 h-4 text-blue-400" /></div>
                        <div className="overflow-hidden"><div className="text-[9px] font-bold text-blue-400 uppercase tracking-[0.2em] leading-none mb-1">Daily Frequency</div><div className="text-xs md:text-sm font-serif italic text-zinc-200 truncate">"{dailyQuestion.content}"</div></div>
                    </div>
                    <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest whitespace-nowrap bg-white/5 px-3 py-1.5 rounded-full hover:bg-white/10 transition-colors pointer-events-none">Open Log</div>
                </motion.button>
            )}

            {isLoading ? ( <div className="flex flex-col items-center gap-4 animate-pulse"><RefreshCw className="w-8 h-8 animate-spin text-zinc-500" /><span className="text-xs text-zinc-500 tracking-[0.3em]">SYNCHRONIZING...</span></div> ) : filteredSignals.length > 0 ? (
                viewMode === 'stack' ? (
                    <div className="relative w-full max-w-2xl h-[55vh] md:h-[550px] flex items-center justify-center perspective-1000 mt-4">
                        {filteredSignals.map((signal, index) => (
                           <SignalCard 
                              key={signal.id}
                              signal={signal}
                              style={getCardStyle(index)}
                              user={user}
                              onDragEnd={handleDragEnd}
                              onExpand={() => { if(index === currentIndex) setIsExpanded(true); }}
                              onLike={handleSendSignal}
                              onTranslate={handleTranslate}
                              isTranslated={translatedIDs[signal.id]}
                              isGlobalEnglish={isGlobalEnglish}
                           />
                        ))}
                        <div className="absolute bottom-0 flex items-center gap-6 md:gap-12 z-30 translate-y-1/2">
                            <button onClick={prevSignal} className="p-3 md:p-4 rounded-full bg-black/20 border border-white/5 text-zinc-500 hover:text-white transition-all backdrop-blur-md"><ChevronLeft className="w-6 h-6 md:w-8 md:h-8" /></button>
                            <button onClick={() => setIsWriting(true)} className="group relative"><div className="absolute inset-0 bg-white blur-xl opacity-20 rounded-full group-hover:opacity-40 transition-opacity" /><div className="relative w-16 h-16 md:w-24 md:h-24 bg-white text-black rounded-full flex items-center justify-center shadow-xl hover:scale-105 transition-transform"><Podcast className="w-8 h-8 md:w-10 md:h-10 animate-pulse" /></div></button>
                            <button onClick={nextSignal} className="p-3 md:p-4 rounded-full bg-black/20 border border-white/5 text-zinc-500 hover:text-white transition-all backdrop-blur-md"><ChevronRight className="w-6 h-6 md:w-8 md:h-8" /></button>
                        </div>
                    </div>
                ) : (
                    <div className="w-full h-[75vh] md:h-[65vh] overflow-y-auto overflow-x-hidden px-2 custom-scrollbar">
                        <div className="grid gap-3 pb-20"> 
                            {filteredSignals.map((signal, index) => (
                                <motion.div key={signal.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`flex items-start gap-4 p-4 bg-white/[0.03] border border-white/10 rounded-2xl hover:bg-white/[0.07] transition-all group cursor-pointer`} onClick={() => { setCurrentIndex(index); setIsExpanded(true); }}>
                                    <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-white/10 overflow-hidden shrink-0 mt-1"><img src={signal.author_avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${signal.author}`} className="w-full h-full object-cover" /></div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-baseline mb-1">
                                            <span className="text-xs font-bold text-zinc-300 truncate hover:text-white transition-colors" onClick={(e) => { e.stopPropagation(); router.push(`/profile/${signal.author}`); }}>@{signal.author}</span>
                                            <span className="text-[10px] font-mono text-zinc-600">{new Date(signal.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                        </div>
                                        <p className="text-sm text-zinc-300 leading-relaxed line-clamp-4 break-words">"{renderText(signal)}"</p>
                                        <div className="flex gap-4 mt-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all text-[10px] font-bold text-zinc-500 uppercase">
                                            <span className={getFrequencyColor(signal.frequency)}>{signal.frequency}</span>
                                            <div className="flex items-center gap-1"><Radio className="w-3 h-3 text-blue-500" /> {signal.likes?.length || 0}</div>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                )
            ) : <div className="text-center opacity-50"><h2 className="text-xl font-serif">Static... The void is silent.</h2><button onClick={() => setIsWriting(true)} className="mt-4 text-blue-400 hover:text-blue-300 underline underline-offset-4 font-bold">Be the first to transmit.</button></div>}
        </div>

        <div className="hidden lg:flex flex-col w-72 h-[calc(100vh-8rem)] fixed right-8 top-32 z-40">
            <div className="w-full h-full bg-black/60 backdrop-blur-xl border border-white/10 rounded-3xl p-4 flex flex-col overflow-hidden relative">
                <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 uppercase tracking-widest"><Briefcase className="w-3 h-3 text-emerald-400" /> Mission Board</div>
                    <div className="flex gap-1">
                        <button onClick={() => setMissionViewMode('list')} className={`p-1 rounded-md transition-all ${missionViewMode === 'list' ? 'bg-white text-black' : 'text-zinc-500 hover:text-white'}`}><List className="w-3 h-3" /></button>
                        <button onClick={() => setMissionViewMode('cards')} className={`p-1 rounded-md transition-all ${missionViewMode === 'cards' ? 'bg-white text-black' : 'text-zinc-500 hover:text-white'}`}><Grid className="w-3 h-3" /></button>
                        <button onClick={() => setIsMissionModalOpen(true)} className="p-1 bg-white text-black rounded-full hover:scale-110 transition-transform ml-2"><Plus className="w-3 h-3" /></button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                    {missions.length > 0 ? missions.map((mission) => (
                        <div key={mission.id} className={`bg-white/[0.03] border border-white/10 p-3 rounded-xl hover:border-white/30 transition-all cursor-pointer group ${missionViewMode === 'list' ? 'flex items-center justify-between py-2' : ''}`} onClick={() => setSelectedMission(mission)}>
                            {missionViewMode === 'cards' ? (
                                <>
                                    <div className="flex justify-between items-start mb-1">
                                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${mission.type === 'paid' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>{mission.type === 'paid' ? 'PAID' : 'PARTNER'}</span>
                                        <span className="text-[8px] text-zinc-600">{new Date(mission.created_at).toLocaleDateString()}</span>
                                    </div>
                                    <h4 className="text-xs font-bold text-white leading-tight mb-1 truncate">{mission.title}</h4>
                                    <p className="text-[10px] text-zinc-500 line-clamp-2 leading-snug">{mission.description}</p>
                                    <div className="mt-2 pt-2 border-t border-white/5 flex justify-between items-center">
                                        <span className="text-[9px] font-mono text-emerald-400">{mission.budget}</span>
                                        <button className="text-[9px] text-zinc-400 hover:text-white transition-colors">Details</button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="flex flex-col min-w-0 pr-2">
                                        <h4 className="text-xs font-bold text-white truncate">{mission.title}</h4>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className={`text-[8px] font-bold ${mission.type === 'paid' ? 'text-emerald-400' : 'text-blue-400'}`}>{mission.type === 'paid' ? 'PAID' : 'PARTNER'}</span>
                                            <span className="text-[8px] text-zinc-600">• {new Date(mission.created_at).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                    <ChevronRight className="w-3 h-3 text-zinc-600 group-hover:text-white transition-colors" />
                                </>
                            )}
                        </div>
                    )) : <div className="text-center text-zinc-700 text-[10px] mt-10">No missions active.<br/>Be the first to hire.</div>}
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-black to-transparent pointer-events-none" />
            </div>
        </div>
      </main>

      {viewMode === 'log' && (
        <button onClick={() => setIsWriting(true)} className="fixed bottom-10 right-8 lg:right-auto lg:left-1/2 lg:-translate-x-1/2 z-50 w-14 h-14 md:w-16 md:h-16 bg-white text-black rounded-full flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-all">
            <Podcast className="w-6 h-6 md:w-8 md:h-8 animate-pulse" />
        </button>
      )}

      <AnimatePresence>
        <WriteModal 
           isOpen={isWriting} 
           onClose={() => setIsWriting(false)} 
           messageText={messageText}
           setMessageText={setMessageText}
           onBroadcast={handleBroadcast}
           isSending={isSending}
           selectedFreq={selectedFreq}
           setSelectedFreq={setSelectedFreq}
        />
        
        {/* MISSION EKLEME MODALI */}
        {isMissionModalOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setIsMissionModalOpen(false)}>
                <motion.div initial={{ scale: 0.9, y: 50 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-md bg-[#0a0a0a] border border-emerald-500/30 rounded-3xl overflow-hidden flex flex-col shadow-[0_0_50px_-10px_rgba(52,211,153,0.2)]" onClick={(e) => e.stopPropagation()}>
                    <div className="p-6 border-b border-white/10 bg-emerald-900/10">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2"><Briefcase className="w-5 h-5 text-emerald-400" /> Post a Mission</h2>
                        <p className="text-xs text-zinc-400 mt-1">Recruit fellow travelers for your project.</p>
                    </div>
                    <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar max-h-[60vh]">
                        <div><label className="text-xs text-zinc-500 uppercase font-bold">Title</label><input value={newMission.title} onChange={e => setNewMission({...newMission, title: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white mt-1 outline-none focus:border-emerald-500/50" /></div>
                        <div className="flex gap-4">
                            <div className="flex-1"><label className="text-xs text-zinc-500 uppercase font-bold">Type</label><div className="flex flex-col gap-2"><button onClick={() => setNewMission({...newMission, type: 'partner'})} className={`p-2 rounded-lg text-xs font-bold border transition-all ${newMission.type === 'partner' ? 'bg-blue-500 text-white border-blue-400' : 'bg-white/5 text-zinc-400 border-white/10 hover:bg-white/10'}`}>Co-Founder</button><button onClick={() => setNewMission({...newMission, type: 'paid'})} className={`p-2 rounded-lg text-xs font-bold border transition-all ${newMission.type === 'paid' ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-white/5 text-zinc-400 border-white/10 hover:bg-white/10'}`}>Paid Gig</button></div></div>
                            <div className="flex-1"><label className="text-xs text-zinc-500 uppercase font-bold">Budget/Equity</label><input value={newMission.budget} onChange={e => setNewMission({...newMission, budget: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white mt-1 outline-none focus:border-emerald-500/50" /></div>
                        </div>
                        <div><label className="text-xs text-zinc-500 uppercase font-bold">Details</label><textarea value={newMission.description} onChange={e => setNewMission({...newMission, description: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white mt-1 outline-none h-24 resize-none focus:border-emerald-500/50" /></div>
                        <div><label className="text-xs text-zinc-500 uppercase font-bold mb-2 block">Contact Methods</label><div className="space-y-2"><div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl p-3 focus-within:border-emerald-500/50 transition-colors"><AtSign className="w-4 h-4 text-zinc-500" /><input value={newMission.contact_email} onChange={e => setNewMission({...newMission, contact_email: e.target.value})} className="bg-transparent border-none outline-none text-sm text-white w-full" placeholder="Email (Required)" /></div><div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl p-3 focus-within:border-blue-500/50 transition-colors"><Video className="w-4 h-4 text-zinc-500" /><input value={newMission.contact_skype} onChange={e => setNewMission({...newMission, contact_skype: e.target.value})} className="bg-transparent border-none outline-none text-sm text-white w-full" placeholder="Skype ID" /></div><div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl p-3 focus-within:border-pink-500/50 transition-colors"><Instagram className="w-4 h-4 text-zinc-500" /><input value={newMission.contact_insta} onChange={e => setNewMission({...newMission, contact_insta: e.target.value})} className="bg-transparent border-none outline-none text-sm text-white w-full" placeholder="Instagram User" /></div></div></div>
                    </div>
                    <div className="p-6 border-t border-white/10 bg-black/40"><button onClick={handleCreateMission} disabled={isPostingMission || !newMission.title || !newMission.contact_email} className="w-full bg-white text-black font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-zinc-200 disabled:opacity-50">{isPostingMission ? <RefreshCw className="w-5 h-5 animate-spin" /> : <><Sparkles className="w-5 h-5 text-yellow-600" /> Post Mission (Free)</>}</button></div>
                </motion.div>
            </motion.div>
        )}
        
        {isMissionListOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm" onClick={() => setIsMissionListOpen(false)}>
                <motion.div initial={{ scale: 0.9, y: 50 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-sm h-[70vh] bg-[#0a0a0a] border border-emerald-500/20 rounded-3xl overflow-hidden flex flex-col relative" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setIsMissionListOpen(false)} className="absolute top-4 right-4 p-2 rounded-full bg-white/5 hover:bg-white/20"><X className="w-5 h-5 text-white" /></button>
                    <div className="p-6 border-b border-white/10 bg-emerald-900/10">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2"><Briefcase className="w-5 h-5 text-emerald-400" /> Mission Board</h2>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3">
                        {missions.length > 0 ? missions.map((mission) => (
                            <div key={mission.id} className="bg-white/5 border border-white/10 p-4 rounded-xl" onClick={() => { setIsMissionListOpen(false); setSelectedMission(mission); }}>
                                <div className="flex justify-between items-start mb-2">
                                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${mission.type === 'paid' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>{mission.type === 'paid' ? 'PAID' : 'PARTNER'}</span>
                                    <span className="text-[9px] text-zinc-600">{new Date(mission.created_at).toLocaleDateString()}</span>
                                </div>
                                <h4 className="text-sm font-bold text-white leading-tight mb-2">{mission.title}</h4>
                                <p className="text-xs text-zinc-400 mb-3 line-clamp-2">{mission.description}</p>
                                <div className="pt-3 border-t border-white/5 flex justify-between items-center">
                                    <span className="text-xs font-mono text-emerald-400">{mission.budget}</span>
                                    <button className="text-xs text-black bg-white px-3 py-1.5 rounded-lg font-bold">Details</button>
                                </div>
                            </div>
                        )) : <div className="text-center text-zinc-500 text-xs mt-10">No missions active.</div>}
                    </div>
                    <div className="p-4 border-t border-white/10">
                        <button onClick={() => { setIsMissionListOpen(false); setIsMissionModalOpen(true); }} className="w-full bg-emerald-500 text-black font-bold py-3 rounded-xl flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Post a Mission</button>
                    </div>
                </motion.div>
            </motion.div>
        )}

        {selectedMission && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedMission(null)}>
                <motion.div initial={{ scale: 0.9, y: 50 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-lg bg-[#0a0a0a] border border-emerald-500/20 rounded-3xl overflow-hidden flex flex-col shadow-2xl max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
                    <div className="p-6 border-b border-white/10 bg-emerald-900/10 flex justify-between items-start shrink-0">
                        <div className="pr-4">
                            <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase tracking-widest border ${selectedMission.type === 'paid' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>{selectedMission.type === 'paid' ? 'Paid Project' : 'Co-Founder Needed'}</span>
                            <h2 className="text-xl font-bold text-white mt-3 leading-tight break-words break-all">{selectedMission.title}</h2>
                        </div>
                        <button onClick={() => setSelectedMission(null)} className="p-2 bg-white/5 rounded-full hover:bg-white/10 shrink-0"><X className="w-5 h-5 text-white" /></button>
                    </div>
                    <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
                        <div className="group cursor-pointer p-3 -m-3 rounded-xl hover:bg-white/5 transition-colors border border-transparent hover:border-white/5" onClick={() => setExpandedBrief(selectedMission.description)}>
                            <div className="text-[10px] text-zinc-500 uppercase font-bold mb-2 flex items-center gap-2">
                                <Briefcase className="w-3 h-3" /> Mission Brief <span className="text-[9px] text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity ml-auto flex items-center gap-1"><Maximize2 className="w-3 h-3" /> Expand</span>
                            </div>
                            <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap line-clamp-4 break-words break-all">{selectedMission.description}</p>
                        </div>
                        <div className="flex gap-4">
                            <div className="flex-1 bg-white/5 rounded-xl p-3 border border-white/5">
                                <div className="text-[10px] text-zinc-500 uppercase font-bold mb-1 flex items-center gap-2"><DollarSign className="w-3 h-3 text-emerald-400" /> Budget</div>
                                <div className="text-sm font-mono text-white truncate">{selectedMission.budget}</div>
                            </div>
                            <div className="flex-1 bg-white/5 rounded-xl p-3 border border-white/5">
                                <div className="text-[10px] text-zinc-500 uppercase font-bold mb-1 flex items-center gap-2"><Calendar className="w-3 h-3 text-blue-500" /> Posted</div>
                                <div className="text-sm font-mono text-white">{new Date(selectedMission.created_at).toLocaleDateString()}</div>
                            </div>
                        </div>
                        <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl">
                            <div className="text-[10px] text-emerald-400 uppercase font-bold mb-3 flex items-center gap-2"><Mail className="w-3 h-3" /> Contact Channels</div>
                            {renderContactInfo(selectedMission.contact_info)}
                        </div>
                    </div>
                    <div className="p-4 bg-white/5 border-t border-white/10 text-center shrink-0">
                        <p className="text-[10px] text-zinc-600">Good luck on your mission, traveler.</p>
                    </div>
                </motion.div>
            </motion.div>
        )}

        {expandedBrief && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-black/95 backdrop-blur-md" onClick={() => setExpandedBrief(null)}>
                <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="w-full max-w-3xl bg-[#0a0a0a] border border-emerald-500/20 rounded-3xl overflow-hidden flex flex-col shadow-2xl max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
                    <div className="p-6 border-b border-white/10 flex justify-between items-center">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2"><Briefcase className="w-5 h-5 text-emerald-400" /> Full Mission Brief</h3>
                        <button onClick={() => setExpandedBrief(null)} className="p-2 bg-white/5 rounded-full hover:bg-white/10"><X className="w-5 h-5 text-white" /></button>
                    </div>
                    <div className="p-8 overflow-y-auto custom-scrollbar">
                        <p className="text-base text-zinc-300 leading-loose whitespace-pre-wrap font-serif break-words break-all">{expandedBrief}</p>
                    </div>
                </motion.div>
            </motion.div>
        )}

        {isDailyOpen && dailyQuestion && (
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setIsDailyOpen(false)}>
                <motion.div initial={{ scale: 0.9, y: 50 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-4xl max-h-[90vh] bg-[#0a0a0a] border border-blue-500/30 rounded-3xl shadow-[0_0_50px_-10px_rgba(59,130,246,0.2)] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                    <div className="p-8 border-b border-white/5 bg-blue-900/10 shrink-0">
                        <div className="flex justify-between items-start mb-4">
                            <div className="text-xs font-bold text-blue-400 uppercase tracking-widest flex items-center gap-2"><Sparkles className="w-4 h-4" /> Topic of the Day</div>
                            <button onClick={() => setIsDailyOpen(false)} className="p-2 hover:bg-white/5 rounded-full"><X className="w-6 h-6" /></button>
                        </div>
                        <h2 className="text-2xl md:text-4xl font-serif text-white leading-tight">"{dailyQuestion.content}"</h2>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
                        <div className="space-y-4">
                            {dailyResponses.length > 0 ? dailyResponses.map((response) => {
                                const isTranslated = translatedIDs[response.id];
                                return (
                                <div key={response.id} className="bg-white/[0.03] border border-white/5 rounded-2xl p-6 hover:bg-white/[0.05] transition-all">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-8 h-8 rounded-full bg-zinc-800 overflow-hidden border border-white/10"><img src={response.author_avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${response.author}`} className="w-full h-full object-cover" /></div>
                                        <div><div className="text-sm font-bold text-white cursor-pointer hover:text-blue-400 transition-colors" onClick={() => { setIsDailyOpen(false); router.push(`/profile/${response.author}`); }}>@{response.author}</div><div className="text-[10px] text-zinc-500">{new Date(response.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div></div>
                                        <button onClick={(e) => handleTranslate(e, response)} className={`ml-auto p-1.5 rounded-full border transition-all ${isTranslated ? 'bg-white text-black border-white' : 'bg-transparent text-zinc-500 border-white/10 hover:text-white'}`}><Globe className="w-3 h-3" /></button>
                                    </div>
                                    <p className="text-zinc-200 leading-relaxed text-lg font-serif">"{renderText(response)}"</p>
                                    <div className="mt-4 flex gap-4 text-xs text-zinc-500 font-bold uppercase tracking-widest">
                                        <button onClick={(e) => handleSendSignal(e, response.id)} className="flex items-center gap-2 hover:text-white"><Radio className={`w-4 h-4 ${response.likes?.some((l:any) => l.user_id === user?.id) ? 'text-blue-500' : ''}`} /> {response.likes?.length || 0} Echoes</button>
                                    </div>
                                </div>
                            ); }) : <div className="text-center py-20 opacity-40"><MessageSquare className="w-12 h-12 mx-auto mb-4" /><p>No transmissions.</p></div>}
                        </div>
                    </div>
                    <div className="p-6 bg-black/40 border-t border-white/5 shrink-0 flex gap-4">
                         <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center shrink-0"><User className="w-5 h-5 text-zinc-500" /></div>
                         <div className="flex-1 relative">
                            <input type="text" value={dailyResponseText} onChange={(e) => setDailyResponseText(e.target.value)} placeholder="Transmit..." className="w-full bg-white/5 border border-white/10 rounded-full py-3 px-5 text-sm text-white outline-none" onKeyDown={(e) => e.key === 'Enter' && handleDailyResponse()} />
                            <button onClick={handleDailyResponse} disabled={isSending || !dailyResponseText.trim()} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-white text-black rounded-full hover:scale-105 transition-all"><CornerDownRight className="w-4 h-4" /></button>
                         </div>
                    </div>
                </motion.div>
             </motion.div>
        )}

        {/* GENİŞLETİLMİŞ SİNYAL MODALI (DETAY VE YORUMLAR) */}
        {isExpanded && !isWriting && currentSignal && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60" onClick={() => setIsExpanded(false)}>
                
                {/* SOL OK (Masaüstü - Sabit) */}
                <button 
                    onClick={(e) => { e.stopPropagation(); prevSignal(); }}
                    className="hidden md:flex fixed left-10 z-[110] p-4 rounded-full bg-white/5 hover:bg-white/10 text-white transition-all border border-white/10"
                >
                    <ChevronLeft className="w-8 h-8" />
                </button>

                <motion.div initial={{ scale: 0.9, y: 50 }} animate={{ scale: 1, y: 0 }} className={`relative w-full max-w-3xl max-h-[90vh] bg-[#0a0a0a] border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col`} onClick={(e) => e.stopPropagation()}>
                    
                    {/* MOBİL ÜST NAVİGASYON (Geri - Başlık - İleri) */}
                    <div className="flex md:hidden items-center justify-between p-4 border-b border-white/5 bg-white/[0.02] shrink-0">
                        <button onClick={prevSignal} className="p-2 text-zinc-400 active:text-white"><ChevronLeft className="w-6 h-6" /></button>
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Signal Explorer</span>
                        <button onClick={nextSignal} className="p-2 text-zinc-400 active:text-white"><ChevronRight className="w-6 h-6" /></button>
                    </div>

                    {/* MODAL HEADER (Yazar Bilgisi ve Kapatma) */}
                    <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/[0.02] shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full border border-white/10 overflow-hidden bg-white/5">
                                <img src={currentSignal.author_avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${currentSignal.author}`} className="w-full h-full object-cover" alt="Author" />
                            </div>
                            <div>
                                <h2 className="font-bold text-white">{currentSignal.author}</h2>
                                <p className="text-xs text-zinc-500 uppercase">{currentSignal.frequency}</p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={(e) => handleTranslate(e, currentSignal)} className={`p-2 rounded-full border transition-all ${translatedIDs[currentSignal.id] ? 'bg-white text-black border-white' : 'bg-transparent text-zinc-500 border-white/10 hover:text-white'}`}>
                                <Globe className="w-4 h-4" />
                            </button>
                            <button onClick={() => setIsExpanded(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                    </div>

                    {/* İÇERİK VE YORUMLAR ALANI */}
                    <div className="flex-1 overflow-y-auto p-6 md:p-10 custom-scrollbar">
                        {/* Ana Metin */}
                        <p className="text-xl md:text-2xl font-serif text-zinc-200 leading-relaxed whitespace-pre-wrap mb-10 mt-6 italic">
                            "{renderText(currentSignal)}"
                        </p>

                        {/* Yorumlar (Log Entries) */}
                        <div className="pt-8 border-t border-white/5">
                            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-6">Log Entries ({currentSignal.comments?.length || 0})</h3>
                            <div className="space-y-6">
                                {(showAllComments ? currentSignal.comments : currentSignal.comments?.slice(0, 2))?.map((comment: any) => (
                                    <div key={comment.id} className="flex gap-4 group">
                                        <div className="w-8 h-8 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center shrink-0">
                                            <User className="w-4 h-4 text-zinc-400" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-sm font-bold text-zinc-300">{comment.author}</span>
                                                <span className="text-[10px] text-zinc-600">{new Date(comment.created_at).toLocaleTimeString()}</span>
                                                {comment.reply_to && (
                                                    <span className="text-[10px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">Replying to @{comment.reply_to}</span>
                                                )}
                                            </div>
                                            <p className="text-sm text-zinc-400 leading-relaxed">{comment.content}</p>
                                            <button onClick={() => initiateReply(comment.author)} className="text-[10px] text-zinc-600 hover:text-white mt-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                                <Reply className="w-3 h-3" /> Reply
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                
                                {/* Daha Fazla Yorum Göster Butonu */}
                                {!showAllComments && currentSignal.comments && currentSignal.comments.length > 2 && (
                                    <button onClick={() => setShowAllComments(true)} className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 transition-colors mt-2 pl-12">
                                        <span>Expand {currentSignal.comments.length - 2} more logs</span>
                                        <ChevronDown className="w-3 h-3" />
                                    </button>
                                )}

                                {(!currentSignal.comments || currentSignal.comments.length === 0) && (
                                    <div className="text-center py-4 opacity-30 text-xs uppercase tracking-widest text-zinc-500">
                                        No log entries found.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    
                    {/* YORUM YAZMA ALANI (ALT PANEL) */}
                    <div className="p-4 md:p-6 bg-black/40 border-t border-white/5 shrink-0">
                        {replyingTo && (
                            <div className="flex items-center justify-between mb-2 px-12 text-xs text-blue-400">
                                <span>Replying to <span className="font-bold">@{replyingTo}</span></span>
                                <button onClick={() => setReplyingTo(null)} className="hover:text-white"><X className="w-3 h-3" /></button>
                            </div>
                        )}
                        <div className="flex gap-3 items-center">
                            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                                <User className="w-5 h-5 text-zinc-500" />
                            </div>
                            <div className="flex-1 relative">
                                <input 
                                    ref={inputRef} 
                                    type="text" 
                                    value={commentText} 
                                    onChange={(e) => setCommentText(e.target.value)} 
                                    placeholder={replyingTo ? `Reply to @${replyingTo}...` : "Transmit a reply..."} 
                                    className="w-full bg-white/5 border border-white/10 rounded-full py-3 px-5 text-sm text-white outline-none focus:border-white/30 pr-12" 
                                    onKeyDown={(e) => e.key === 'Enter' && handlePostComment(currentSignal.id)} 
                                />
                                <button 
                                    onClick={() => handlePostComment(currentSignal.id)} 
                                    disabled={isPostingComment || !commentText.trim()} 
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-white text-black rounded-full hover:scale-105 disabled:opacity-50 transition-all"
                                >
                                    <CornerDownRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* SAĞ OK (Masaüstü - Sabit) */}
                <button 
                    onClick={(e) => { e.stopPropagation(); nextSignal(); }}
                    className="hidden md:flex fixed right-10 z-[110] p-4 rounded-full bg-white/5 hover:bg-white/10 text-white transition-all border border-white/10"
                >
                    <ChevronRight className="w-8 h-8" />
                </button>
            </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}