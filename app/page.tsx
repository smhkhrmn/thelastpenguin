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
import { SignalData, MissionData, FREQUENCIES } from "@/types";
import SignalCard from "@/components/lighthouse/SignalCard";
import WriteModal from "@/components/modals/WriteModal";

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
  
  // STATE
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
  const [newMission, setNewMission] = useState({ title: '', type: 'partner' as 'partner' | 'paid', description: '', budget: '', contact_email: '', contact_skype: '', contact_insta: '' });
  const [isPostingMission, setIsPostingMission] = useState(false);

  // EFFECTS
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

  // FUNCTIONS
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
  
  const getCardStyle = (index: number) => {
    const total = filteredSignals.length;
    let dist = (index - currentIndex + total) % total;
    if (dist > total / 2) dist -= total;
    if (dist === 0) return { zIndex: 30, x: 0, scale: 1, opacity: 1, filter: "blur(0px)", display: "block" };
    if (dist === 1) return { zIndex: 20, x: 350, scale: 0.85, opacity: 0.5, filter: "blur(4px)", display: "block" };
    if (dist === -1) return { zIndex: 20, x: -350, scale: 0.85, opacity: 0.5, filter: "blur(4px)", display: "block" };
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

      {/* HEADER: Absolute ve z-50 ile her zaman üstte */}
      <header className={`absolute top-0 left-0 right-0 z-50 p-4 md:p-6 lg:p-8 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent pointer-events-none ${isWriting || showSetup ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}>
        <div className="flex items-center gap-4 pointer-events-auto">
            <div className="flex flex-col cursor-pointer" onClick={() => window.location.reload()}>
                <h1 className="text-base md:text-xl lg:text-2xl font-bold tracking-tighter mix-blend-difference text-white">The Last Penguin</h1>
                <span className="text-[7px] md:text-[9px] uppercase tracking-[0.3em] text-zinc-500 mt-0.5">Frequency Scanner v1.0</span>
            </div>
        </div>
        <div className="flex items-center gap-2 md:gap-4 pointer-events-auto">
            {/* Search ve View butonları sadece laptop ve üzeri (md) ekranlarda */}
            <div className="hidden md:flex items-center gap-2">
                <div className="flex bg-white/5 border border-white/10 p-0.5 rounded-xl">
                    <button onClick={() => setViewMode('stack')} className={`p-1.5 rounded-lg transition-all ${viewMode === 'stack' ? 'bg-white text-black' : 'text-zinc-500'}`}><Layers className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setViewMode('log')} className={`p-1.5 rounded-lg transition-all ${viewMode === 'log' ? 'bg-white text-black' : 'text-zinc-500'}`}><LayoutGrid className="w-3.5 h-3.5" /></button>
                </div>
                <div className="flex items-center bg-white/5 border border-white/10 rounded-full px-3 py-1.5 gap-2">
                    <Search className="w-3 h-3 text-zinc-500" />
                    <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Scan..." className="bg-transparent border-none outline-none text-[11px] w-20 lg:w-32 text-white" />
                </div>
            </div>
            
            {/* Mobil Menü Butonları */}
            <div className="flex md:hidden gap-2">
                 <button onClick={() => setIsGlobalEnglish(!isGlobalEnglish)} className={`p-2 rounded-full border transition-all ${isGlobalEnglish ? 'bg-white text-black border-white' : 'text-zinc-400 bg-white/10 border-white/10'}`}><Globe className="w-4 h-4" /></button>
                 <button onClick={() => setIsMissionListOpen(true)} className="p-2 rounded-full bg-white/10 border border-white/10 text-emerald-400"><Briefcase className="w-4 h-4" /></button>
            </div>

            {user ? (
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-2.5 py-1 rounded-full backdrop-blur-md">
                    <button onClick={() => setIsGlobalEnglish(!isGlobalEnglish)} className={`hidden md:block p-1 rounded-full border transition-all ${isGlobalEnglish ? 'bg-white text-black border-white' : 'text-zinc-400 border-white/10 hover:text-white'}`}><Globe className="w-3.5 h-3.5" /></button>
                    <img src={user.user_metadata.avatar_url} className="w-6 h-6 rounded-full border border-white/20 cursor-pointer" onClick={() => router.push(`/profile/${encodeURIComponent(profile?.username || user.id)}`)} />
                    <button onClick={() => supabase.auth.signOut()} className="p-1 hover:text-red-400 transition-colors"><LogOut className="w-3.5 h-3.5" /></button>
                </div>
            ) : ( 
                <button onClick={() => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` } })} className="bg-white text-black px-4 py-1.5 rounded-full text-[10px] font-bold tracking-widest uppercase hover:scale-105 transition-transform">Login</button> 
            )}
        </div>
      </header>

      {/* MENÜ: Ekranın üstünde ama Header'ın altında */}
      <div className={`absolute top-20 md:top-24 left-0 right-0 z-40 flex justify-center px-4 transition-all duration-500 ${isWriting || showSetup ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}>
        <div className="flex bg-black/60 backdrop-blur-xl border border-white/10 p-1 rounded-2xl gap-1 overflow-x-auto no-scrollbar max-w-full">
          {FREQUENCIES.map((freq) => (
            <button key={freq.id} onClick={() => setFilterFreq(freq.id)} className={`px-3 py-1.5 rounded-xl text-[10px] md:text-xs font-bold transition-all whitespace-nowrap ${filterFreq === freq.id ? 'bg-white text-black shadow-lg' : 'text-zinc-500 hover:text-white hover:bg-white/5'}`}>
              <div className="flex items-center gap-1.5">{freq.id !== 'all' && ( <div className={`w-1.5 h-1.5 rounded-full ${freq.color}`} /> )}{freq.name}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ANA İÇERİK: Dikey Ortalama (Flex-Col + Justify-Center) - 15 inç ve 27 inç sorununu çözen anahtar burası */}
      <main className={`relative z-10 w-full h-full flex flex-col justify-center items-center transition-all duration-700 ${isExpanded || isWriting || showSetup || isDailyOpen || isMissionModalOpen || isMissionListOpen || selectedMission ? 'scale-90 opacity-0 pointer-events-none blur-xl' : 'scale-100 opacity-100'}`}>
        
        {/* KART ALANI */}
        <div className="w-full max-w-2xl px-4 flex flex-col items-center mt-10 md:mt-0">
            {/* Günlük Soru - Kartların hemen üzerinde */}
            {!isLoading && dailyQuestion && (
                <motion.button initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative z-40 w-full max-w-md md:max-w-xl mb-4 flex items-center justify-between p-2.5 px-4 rounded-full border bg-black/40 backdrop-blur-xl border-blue-500/20 shadow-[0_0_15px_-5px_rgba(59,130,246,0.2)] cursor-pointer hover:border-blue-500/40 transition-all text-left" onClick={() => { if(dailyQuestion) { fetchDailyResponses(dailyQuestion.id); setIsDailyOpen(true); } }}>
                    <div className="flex items-center gap-3 overflow-hidden pointer-events-none">
                        <div className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 border border-blue-500/20"><Sparkles className="w-3 md:w-3.5 h-3 md:h-3.5 text-blue-400" /></div>
                        <div className="overflow-hidden"><div className="text-[8px] font-bold text-blue-400 uppercase tracking-[0.2em] mb-0.5">Daily Frequency</div><div className="text-[10px] md:text-sm font-serif italic text-zinc-200 truncate">"{dailyQuestion.content}"</div></div>
                    </div>
                    <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest whitespace-nowrap bg-white/5 px-2.5 py-1.5 rounded-full hover:bg-white/10 transition-colors pointer-events-none">Open</div>
                </motion.button>
            )}

            {isLoading ? ( <div className="flex flex-col items-center gap-4 animate-pulse"><RefreshCw className="w-8 h-8 animate-spin text-zinc-500" /><span className="text-xs text-zinc-500 tracking-[0.3em]">SYNCHRONIZING...</span></div> ) : filteredSignals.length > 0 ? (
                viewMode === 'stack' ? (
                    <div className="relative w-full max-w-md md:max-w-xl lg:max-w-2xl 2xl:max-w-4xl h-[350px] md:h-[450px] 2xl:h-[600px] flex items-center justify-center perspective-1000">
                        {filteredSignals.map((signal, index) => (
                           <SignalCard key={signal.id} signal={signal} style={getCardStyle(index)} user={user} onDragEnd={handleDragEnd} onExpand={() => { if(index === currentIndex) setIsExpanded(true); }} onLike={handleSendSignal} onTranslate={handleTranslate} isTranslated={translatedIDs[signal.id]} isGlobalEnglish={isGlobalEnglish} />
                        ))}
                        {/* ALT BUTONLAR - Kartların altına sabitlendi */}
                        <div className="absolute -bottom-16 md:-bottom-20 flex items-center gap-8 md:gap-12 z-30">
                            <button onClick={prevSignal} className="p-3 md:p-4 rounded-full bg-black/40 border border-white/10 text-zinc-500 hover:text-white transition-all backdrop-blur-md"><ChevronLeft className="w-5 h-5 md:w-6 md:h-6" /></button>
                            <button onClick={() => setIsWriting(true)} className="group relative"><div className="absolute inset-0 bg-white blur-xl opacity-20 rounded-full group-hover:opacity-40 transition-opacity" /><div className="relative w-14 h-14 md:w-16 md:h-16 bg-white text-black rounded-full flex items-center justify-center shadow-xl hover:scale-105 transition-transform"><Podcast className="w-6 h-6 md:w-8 md:h-8 animate-pulse" /></div></button>
                            <button onClick={nextSignal} className="p-3 md:p-4 rounded-full bg-black/40 border border-white/10 text-zinc-500 hover:text-white transition-all backdrop-blur-md"><ChevronRight className="w-5 h-5 md:w-6 md:h-6" /></button>
                        </div>
                    </div>
                ) : (
                    <div className="w-full h-[60vh] overflow-y-auto overflow-x-hidden px-2 custom-scrollbar pb-20">
                        <div className="grid gap-3"> 
                            {filteredSignals.map((signal, index) => (
                                <motion.div key={signal.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`flex items-start gap-4 p-4 bg-white/[0.03] border border-white/10 rounded-2xl hover:bg-white/[0.07] transition-all group cursor-pointer`} onClick={() => { setCurrentIndex(index); setIsExpanded(true); }}>
                                    <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-white/10 overflow-hidden shrink-0 mt-1"><img src={signal.author_avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${signal.author}`} className="w-full h-full object-cover" /></div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-baseline mb-1">
                                            <span className="text-xs font-bold text-zinc-300 truncate hover:text-white transition-colors" onClick={(e) => { e.stopPropagation(); router.push(`/profile/${signal.author}`); }}>@{signal.author}</span>
                                            <span className="text-[10px] font-mono text-zinc-600">{new Date(signal.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                        </div>
                                        <p className="text-sm text-zinc-300 leading-relaxed line-clamp-4 break-words">"{renderText(signal)}"</p>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                )
            ) : <div className="text-center opacity-50"><h2 className="text-xl font-serif">Static... The void is silent.</h2><button onClick={() => setIsWriting(true)} className="mt-4 text-blue-400 hover:text-blue-300 underline underline-offset-4 font-bold">Be the first to transmit.</button></div>}
        </div>

        {/* MISSION BOARD - Responsive: Laptopta küçülür, Desktopta büyür */}
        <div className="hidden lg:flex flex-col w-64 xl:w-72 2xl:w-80 h-[60vh] 2xl:h-[70vh] fixed right-6 xl:right-10 top-1/2 -translate-y-1/2 z-40">
            <div className="w-full h-full bg-black/60 backdrop-blur-xl border border-white/10 rounded-3xl p-4 flex flex-col overflow-hidden relative shadow-2xl">
                <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 uppercase tracking-widest"><Briefcase className="w-3 h-3 text-emerald-400" /> Mission Board</div>
                    <div className="flex gap-1.5 items-center">
                        <button onClick={() => setMissionViewMode('list')} className={`p-1 rounded transition-all ${missionViewMode === 'list' ? 'bg-white text-black' : 'text-zinc-500 hover:text-white'}`}><List className="w-3 h-3" /></button>
                        <button onClick={() => setMissionViewMode('cards')} className={`p-1 rounded transition-all ${missionViewMode === 'cards' ? 'bg-white text-black' : 'text-zinc-500 hover:text-white'}`}><Grid className="w-3 h-3" /></button>
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsMissionModalOpen(true); }} className="relative z-[60] p-1.5 bg-white text-black rounded-full hover:scale-110 active:scale-95 transition-all shadow-lg ml-2"><Plus className="w-3.5 h-3.5" /></button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                    {missions.length > 0 ? missions.map((mission) => (
                        <div key={mission.id} className={`bg-white/[0.03] border border-white/10 p-3 rounded-xl hover:border-white/30 transition-all cursor-pointer group`} onClick={() => setSelectedMission(mission)}>
                            <div className="flex justify-between items-start mb-1">
                                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${mission.type === 'paid' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>{mission.type === 'paid' ? 'PAID' : 'PARTNER'}</span>
                                <span className="text-[8px] text-zinc-600">{new Date(mission.created_at).toLocaleDateString()}</span>
                            </div>
                            <h4 className="text-[11px] font-bold text-white leading-tight mb-1 truncate">{mission.title}</h4>
                            <p className="text-[9px] text-zinc-500 line-clamp-2 leading-snug">{mission.description}</p>
                            <div className="mt-2 pt-2 border-t border-white/5 flex justify-between items-center text-[8px] font-mono text-emerald-400">
                                <span>{mission.budget}</span>
                                <ChevronRight className="w-2.5 h-2.5 text-zinc-600 group-hover:text-white transition-colors" />
                            </div>
                        </div>
                    )) : <div className="text-center text-zinc-700 text-[10px] mt-10 italic">No missions active.<br/>Be the first to hire.</div>}
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
        <WriteModal isOpen={isWriting} onClose={() => setIsWriting(false)} messageText={messageText} setMessageText={setMessageText} onBroadcast={handleBroadcast} isSending={isSending} selectedFreq={selectedFreq} setSelectedFreq={setSelectedFreq} />
        
        {/* MISSION EKLEME MODALI - KOMPAKT & GRID */}
        {isMissionModalOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setIsMissionModalOpen(false)}>
                <motion.div initial={{ scale: 0.9, y: 50 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-lg bg-[#0a0a0a] border border-emerald-500/30 rounded-3xl overflow-hidden flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
                    <div className="p-5 border-b border-white/10 bg-emerald-900/10 flex justify-between items-center">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2"><Briefcase className="w-5 h-5 text-emerald-400" /> Post a Mission</h2>
                        <button onClick={() => setIsMissionModalOpen(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors"><X className="w-5 h-5 text-white" /></button>
                    </div>
                    <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
                        <div className="grid grid-cols-3 gap-4">
                            <div className="col-span-2">
                                <label className="text-[10px] text-zinc-500 uppercase font-bold pl-1">Project Title</label>
                                <input value={newMission.title} onChange={e => setNewMission({...newMission, title: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white mt-1 outline-none focus:border-emerald-500/50 text-sm" placeholder="e.g. AI Assistant" />
                            </div>
                            <div>
                                <label className="text-[10px] text-zinc-500 uppercase font-bold pl-1">Type</label>
                                <select value={newMission.type} onChange={e => setNewMission({...newMission, type: e.target.value as any})} className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white mt-1 outline-none text-sm appearance-none"><option value="partner" className="bg-black">Partner</option><option value="paid" className="bg-black">Paid Gig</option></select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] text-zinc-500 uppercase font-bold pl-1">Budget / Equity</label>
                                <input value={newMission.budget} onChange={e => setNewMission({...newMission, budget: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white mt-1 outline-none focus:border-emerald-500/50 text-sm" placeholder="$500 or %10" />
                            </div>
                            <div>
                                <label className="text-[10px] text-zinc-500 uppercase font-bold pl-1">Contact Email</label>
                                <input value={newMission.contact_email} onChange={e => setNewMission({...newMission, contact_email: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white mt-1 outline-none focus:border-emerald-500/50 text-sm" placeholder="hello@example.com" />
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] text-zinc-500 uppercase font-bold pl-1">Mission Brief</label>
                            <textarea value={newMission.description} onChange={e => setNewMission({...newMission, description: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white mt-1 h-24 resize-none outline-none focus:border-emerald-500/50 text-sm" placeholder="Describe the objectives..." />
                        </div>
                    </div>
                    <div className="p-5 border-t border-white/10 bg-black/40"><button onClick={handleCreateMission} disabled={isPostingMission || !newMission.title || !newMission.contact_email} className="w-full bg-white text-black font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:bg-zinc-200 disabled:opacity-50 transition-colors">{isPostingMission ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Publish Mission (Free)"}</button></div>
                </motion.div>
            </motion.div>
        )}

        {/* MISSION LIST MODAL (Mobil için) */}
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
                            </div>
                        )) : <div className="text-center text-zinc-500 text-xs mt-10">No missions active.</div>}
                    </div>
                    <div className="p-4 border-t border-white/10">
                        <button onClick={() => { setIsMissionListOpen(false); setIsMissionModalOpen(true); }} className="w-full bg-emerald-500 text-black font-bold py-3 rounded-xl flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Post a Mission</button>
                    </div>
                </motion.div>
            </motion.div>
        )}

        {/* MISSION DETAILS MODAL */}
        {selectedMission && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedMission(null)}>
                <motion.div initial={{ scale: 0.9, y: 50 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-lg bg-[#0a0a0a] border border-emerald-500/20 rounded-3xl overflow-hidden flex flex-col shadow-2xl max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
                    <div className="p-6 border-b border-white/10 bg-emerald-900/10 flex justify-between items-start shrink-0">
                        <div className="pr-4">
                            <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase tracking-widest border ${selectedMission.type === 'paid' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>{selectedMission.type === 'paid' ? 'Paid Project' : 'Co-Founder Needed'}</span>
                            <h2 className="text-xl font-bold text-white mt-3 leading-tight break-words">{selectedMission.title}</h2>
                        </div>
                        <button onClick={() => setSelectedMission(null)} className="p-2 bg-white/5 rounded-full hover:bg-white/10 shrink-0"><X className="w-5 h-5 text-white" /></button>
                    </div>
                    <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
                        <div className="group cursor-pointer p-3 -m-3 rounded-xl hover:bg-white/5 transition-colors border border-transparent hover:border-white/5" onClick={() => setExpandedBrief(selectedMission.description)}>
                            <div className="text-[10px] text-zinc-500 uppercase font-bold mb-2 flex items-center gap-2"><Briefcase className="w-3 h-3" /> Mission Brief</div>
                            <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{selectedMission.description}</p>
                        </div>
                        <div className="flex gap-4">
                            <div className="flex-1 bg-white/5 rounded-xl p-3 border border-white/5">
                                <div className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Budget</div>
                                <div className="text-sm font-mono text-white">{selectedMission.budget}</div>
                            </div>
                            <div className="flex-1 bg-white/5 rounded-xl p-3 border border-white/5">
                                <div className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Posted</div>
                                <div className="text-sm font-mono text-white">{new Date(selectedMission.created_at).toLocaleDateString()}</div>
                            </div>
                        </div>
                        <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl">
                            <div className="text-[10px] text-emerald-400 uppercase font-bold mb-3 flex items-center gap-2"><Mail className="w-3 h-3" /> Contact Information</div>
                            <div className="text-sm text-white font-mono select-all cursor-pointer break-all">{renderContactInfo(selectedMission.contact_info)}</div>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        )}

        {/* DAILY FREQUENCY MODAL */}
        {isDailyOpen && dailyQuestion && (
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setIsDailyOpen(false)}>
                <motion.div initial={{ scale: 0.9, y: 50 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-4xl max-h-[90vh] bg-[#0a0a0a] border border-blue-500/30 rounded-3xl shadow-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                    <div className="p-6 md:p-8 border-b border-white/5 bg-blue-900/10 shrink-0">
                        <div className="flex justify-between items-start mb-4">
                            <div className="text-[10px] font-bold text-blue-400 uppercase tracking-widest flex items-center gap-2"><Sparkles className="w-4 h-4" /> Topic of the Day</div>
                            <button onClick={() => setIsDailyOpen(false)} className="p-2 hover:bg-white/5 rounded-full"><X className="w-6 h-6" /></button>
                        </div>
                        <h2 className="text-xl md:text-3xl font-serif text-white leading-tight italic">"{dailyQuestion.content}"</h2>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                        <div className="space-y-4">
                            {dailyResponses.length > 0 ? dailyResponses.map((response) => (
                                <div key={response.id} className="bg-white/[0.03] border border-white/5 rounded-2xl p-5">
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-7 h-7 rounded-full bg-zinc-800 overflow-hidden"><img src={response.author_avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${response.author}`} className="w-full h-full" /></div>
                                        <div className="text-xs font-bold text-white">@{response.author}</div>
                                    </div>
                                    <p className="text-zinc-200 text-sm md:text-base leading-relaxed">"{renderText(response)}"</p>
                                </div>
                            )) : <div className="text-center py-10 opacity-30 text-xs uppercase tracking-widest">No transmissions yet...</div>}
                        </div>
                    </div>
                    <div className="p-6 bg-black/40 border-t border-white/5 shrink-0 flex gap-4">
                         <div className="flex-1 relative">
                            <input type="text" value={dailyResponseText} onChange={(e) => setDailyResponseText(e.target.value)} placeholder="Transmit your answer..." className="w-full bg-white/5 border border-white/10 rounded-full py-3 px-5 text-sm text-white outline-none focus:border-blue-500/50" onKeyDown={(e) => e.key === 'Enter' && handleDailyResponse()} />
                            <button onClick={handleDailyResponse} disabled={isSending || !dailyResponseText.trim()} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-white text-black rounded-full hover:scale-105 transition-all"><CornerDownRight className="w-4 h-4" /></button>
                         </div>
                    </div>
                </motion.div>
             </motion.div>
        )}

        {/* GENİŞLETİLMİŞ SİNYAL MODAL (Swipe & Navigation Integrated) */}
        {isExpanded && !isWriting && currentSignal && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60" onClick={() => setIsExpanded(false)}>
                <button onClick={(e) => { e.stopPropagation(); prevSignal(); }} className="hidden md:flex fixed left-10 z-[110] p-4 rounded-full bg-white/5 hover:bg-white/10 text-white transition-all border border-white/10 active:scale-90"><ChevronLeft className="w-8 h-8" /></button>
                <motion.div initial={{ scale: 0.9, y: 50 }} animate={{ scale: 1, y: 0 }} drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.4} onDragEnd={(e, info) => { if (info.offset.x < -100) nextSignal(); else if (info.offset.x > 100) prevSignal(); }} className={`relative w-full max-w-3xl max-h-[85vh] bg-[#0a0a0a] border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col touch-none`} onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/[0.02] shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full border border-white/10 overflow-hidden bg-white/5"><img src={currentSignal.author_avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${currentSignal.author}`} className="w-full h-full object-cover" /></div>
                            <div><h2 className="font-bold text-white text-sm md:text-base">{currentSignal.author}</h2><p className="text-[10px] text-zinc-500 uppercase">{currentSignal.frequency}</p></div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={(e) => handleTranslate(e, currentSignal)} className={`p-2 rounded-full border transition-all ${translatedIDs[currentSignal.id] ? 'bg-white text-black border-white' : 'bg-transparent text-zinc-500 border-white/10 hover:text-white'}`}><Globe className="w-4 h-4" /></button>
                            <button onClick={() => setIsExpanded(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors"><X className="w-6 h-6" /></button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 md:p-10 custom-scrollbar">
                        <p className="text-lg md:text-2xl font-serif text-zinc-200 leading-relaxed whitespace-pre-wrap mb-10 mt-4 italic">"{renderText(currentSignal)}"</p>
                        <div className="pt-8 border-t border-white/5">
                            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-6">Log Entries ({currentSignal.comments?.length || 0})</h3>
                            <div className="space-y-6 pb-4">
                                {(showAllComments ? currentSignal.comments : currentSignal.comments?.slice(0, 2))?.map((comment: any) => (
                                    <div key={comment.id} className="flex gap-4 group">
                                        <div className="w-8 h-8 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center shrink-0"><User className="w-4 h-4 text-zinc-400" /></div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-sm font-bold text-zinc-300">{comment.author}</span>
                                                <span className="text-[10px] text-zinc-600">{new Date(comment.created_at).toLocaleTimeString()}</span>
                                            </div>
                                            <p className="text-sm text-zinc-400 leading-relaxed">{comment.content}</p>
                                            <button onClick={() => initiateReply(comment.author)} className="text-[10px] text-zinc-600 hover:text-white mt-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all"><Reply className="w-3 h-3" /> Reply</button>
                                        </div>
                                    </div>
                                ))}
                                {!showAllComments && currentSignal.comments && currentSignal.comments.length > 2 && (
                                    <button onClick={() => setShowAllComments(true)} className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 transition-colors mt-2 pl-12"><span>Expand logs</span><ChevronDown className="w-3 h-3" /></button>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="p-4 md:p-6 bg-black/40 border-t border-white/5 shrink-0">
                        <div className="flex gap-3 items-center">
                            <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-white/5 flex items-center justify-center shrink-0"><User className="w-4 h-4 md:w-5 md:h-5 text-zinc-500" /></div>
                            <div className="flex-1 relative">
                                <input ref={inputRef} type="text" value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Transmit a reply..." className="w-full bg-white/5 border border-white/10 rounded-full py-2.5 md:py-3 px-5 text-[13px] text-white outline-none focus:border-white/30 pr-12" onKeyDown={(e) => e.key === 'Enter' && handlePostComment(currentSignal.id)} />
                                <button onClick={() => handlePostComment(currentSignal.id)} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-white hover:scale-110 transition-all"><CornerDownRight className="w-4 h-4" /></button>
                            </div>
                        </div>
                    </div>
                </motion.div>
                <button onClick={(e) => { e.stopPropagation(); nextSignal(); }} className="hidden md:flex fixed right-10 z-[110] p-4 rounded-full bg-white/5 hover:bg-white/10 text-white transition-all border border-white/10 active:scale-90"><ChevronRight className="w-8 h-8" /></button>
                <div className="md:hidden fixed bottom-10 left-0 right-0 flex justify-between px-10 z-[120] pointer-events-none">
                    <button onClick={(e) => { e.stopPropagation(); prevSignal(); }} className="p-4 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 text-white pointer-events-auto active:scale-90 transition-all shadow-2xl"><ChevronLeft className="w-6 h-6" /></button>
                    <button onClick={(e) => { e.stopPropagation(); nextSignal(); }} className="p-4 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 text-white pointer-events-auto active:scale-90 transition-all shadow-2xl"><ChevronRight className="w-6 h-6" /></button>
                </div>
            </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}