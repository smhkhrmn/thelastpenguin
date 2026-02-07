"use client";

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { 
  MessageSquare, User, CornerDownRight, LogIn, LogOut, Search, Plus, 
  Sparkles, Globe, Briefcase, Radio, Compass, LayoutTemplate,
  ChevronRight, X, Star, Send, Feather, Bell
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

// Yeni Tema Renkleri (Altın/Amber vurgulu)
const getFrequencyStyle = (freqId: string) => {
    const styles: {[key: string]: string} = {
        'general': 'bg-zinc-500/10 text-zinc-300 border-zinc-500/20',
        'tech': 'bg-blue-500/10 text-blue-300 border-blue-500/20',
        'art': 'bg-purple-500/10 text-purple-300 border-purple-500/20',
        'science': 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20',
        'philosophy': 'bg-amber-500/10 text-amber-300 border-amber-500/20',
        'music': 'bg-pink-500/10 text-pink-300 border-pink-500/20',
        'business': 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    };
    return styles[freqId] || 'bg-zinc-500/10 text-zinc-300 border-zinc-500/20';
};

export default function LighthousePage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  
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
  const [notifications, setNotifications] = useState<any[]>([]);

  // UI State
  const [isWriting, setIsWriting] = useState(false);
  const [selectedSignal, setSelectedSignal] = useState<SignalData | null>(null);
  const [selectedMission, setSelectedMission] = useState<MissionData | null>(null);
  const [isDailyOpen, setIsDailyOpen] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState<'missions' | 'notifications' | null>(null); // Yeni sağ panel kontrolü

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
    <div className="relative min-h-screen w-full font-sans selection:bg-indigo-500/30">
      <div className="stars-bg"></div>
      <div className="nebula-glow"></div>
      {showSetup && user && ( <ProfileSetup userId={user.id} onComplete={() => { setShowSetup(false); fetchProfile(user.id); }} /> )}

      {/* HEADER - Minimalist ve Zarif */}
      <header className="fixed top-0 left-0 right-0 z-50 py-4 px-6 flex justify-between items-center bg-black/20 backdrop-blur-md border-b border-white/5">
        <div className="flex items-center gap-3 cursor-pointer group" onClick={() => window.location.reload()}>
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform">
                <Compass className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-white">The Last Penguin</h1>
        </div>

        <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center bg-white/5 border border-white/10 rounded-full px-3 py-1.5 focus-within:border-white/30 transition-all">
                <Search className="w-4 h-4 text-slate-400 mr-2" />
                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search frequency..." className="bg-transparent border-none outline-none text-sm text-white placeholder:text-slate-500 w-40 lg:w-56" />
            </div>
            
            {user ? (
                <div className="flex items-center gap-3">
                    <button onClick={() => setIsGlobalEnglish(!isGlobalEnglish)} className={`p-2 rounded-full transition-all ${isGlobalEnglish ? 'bg-white/20 text-white' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}><Globe className="w-5 h-5" /></button>
                    <div className="relative group">
                        <img src={user.user_metadata.avatar_url} className="w-9 h-9 rounded-full border border-white/10 cursor-pointer group-hover:border-indigo-400 transition-all" onClick={() => router.push(`/profile/${encodeURIComponent(profile?.username || user.id)}`)} />
                        <div className="absolute right-0 mt-2 w-48 bg-[#0a0a20] border border-white/10 rounded-xl shadow-xl py-2 opacity-0 group-hover:opacity-100 invisible group-hover:visible transition-all z-50">
                            <button onClick={() => router.push(`/profile/${encodeURIComponent(profile?.username || user.id)}`)} className="w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-white/5 flex items-center gap-2"><User className="w-4 h-4" /> Profile</button>
                            <button onClick={() => supabase.auth.signOut()} className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-white/5 flex items-center gap-2"><LogOut className="w-4 h-4" /> Log Out</button>
                        </div>
                    </div>
                </div>
            ) : (
                <button onClick={() => supabase.auth.signInWithOAuth({ provider: 'google' })} className="px-5 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm font-bold transition-all backdrop-blur-md border border-white/10">Login</button>
            )}
        </div>
      </header>

      {/* ANA YAPI - 3 Sütunlu Izgara (Grid) */}
      <div className="pt-20 h-screen flex justify-center overflow-hidden relative z-10">
          
          {/* SOL KENAR ÇUBUĞU (Navigasyon) - Floating Dock Stili */}
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 md:static md:translate-x-0 md:flex flex-col items-center gap-4 p-4 z-50">
              <div className="flex md:flex-col items-center gap-3 bg-black/40 backdrop-blur-xl border border-white/10 p-2 rounded-2xl shadow-2xl">
                  <button onClick={() => {setFilterFreq('all'); setShowRightPanel(null)}} className={`p-3 rounded-xl transition-all group relative ${filterFreq === 'all' ? 'bg-indigo-500/20 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                      <LayoutTemplate className="w-5 h-5" />
                      <span className="absolute left-full ml-2 px-2 py-1 bg-black/80 text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none hidden md:block">All Signals</span>
                  </button>
                  {FREQUENCIES.slice(0, 3).map(freq => (
                      <button key={freq.id} onClick={() => setFilterFreq(freq.id)} className={`p-3 rounded-xl transition-all group relative ${filterFreq === freq.id ? `bg-${freq.color.split('-')[1]}-500/20 text-white` : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                          <div className={`w-2.5 h-2.5 rounded-full ${freq.color} shadow-sm`}></div>
                          <span className="absolute left-full ml-2 px-2 py-1 bg-black/80 text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none hidden md:block">{freq.name}</span>
                      </button>
                  ))}
                  <div className="w-px h-6 bg-white/10 md:w-6 md:h-px my-1"></div>
                  <button onClick={() => setShowRightPanel(showRightPanel === 'missions' ? null : 'missions')} className={`p-3 rounded-xl transition-all group relative ${showRightPanel === 'missions' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                      <Briefcase className="w-5 h-5" />
                       {missions.length > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-amber-400 rounded-full shadow-sm"></span>}
                  </button>
              </div>
              
              <button onClick={() => setIsWriting(true)} className="p-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-full shadow-lg shadow-indigo-500/30 hover:scale-105 active:scale-95 transition-all md:mt-4">
                  <Feather className="w-6 h-6" />
              </button>
          </div>

          {/* ORTA SÜTUN - AKIŞ (FEED) */}
          <main className="flex-1 max-w-2xl w-full h-full overflow-y-auto custom-scrollbar p-4 pb-32 md:pb-4 space-y-6 mask-image-b-fade">
              
              {/* Günlük Soru Kartı (Premium His) */}
              {dailyQuestion && (
                  <div onClick={() => { if(dailyQuestion) { fetchDailyResponses(dailyQuestion.id); setIsDailyOpen(true); } }} className="relative overflow-hidden rounded-2xl cursor-pointer group">
                      <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-purple-500/10 to-indigo-500/10 backdrop-blur-xl border border-white/10 transition-all group-hover:border-amber-500/30"></div>
                      <div className="relative p-6 flex flex-col items-center text-center z-10">
                          <div className="flex items-center gap-2 text-amber-300 text-xs font-bold uppercase tracking-widest mb-3">
                              <Star className="w-4 h-4 fill-current" /> Daily Reflection
                          </div>
                          <h2 className="text-xl md:text-2xl font-serif italic text-white mb-4 leading-relaxed">"{dailyQuestion.content}"</h2>
                          <div className="flex items-center gap-2 text-sm text-slate-300 bg-white/5 px-4 py-2 rounded-full">
                              <Sparkles className="w-4 h-4" /> {dailyResponses.length} Explorers Responded
                          </div>
                      </div>
                  </div>
              )}

              {/* Sinyal Kartları */}
              {isLoading ? (
                  <div className="flex justify-center py-20">
                      <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
                  </div>
              ) : filteredSignals.map((signal) => (
                  <motion.div layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} key={signal.id} onClick={() => setSelectedSignal(signal)} className="bg-white/5 backdrop-blur-md border border-white/10 p-6 rounded-2xl hover:bg-white/10 hover:border-white/20 transition-all cursor-pointer group relative overflow-hidden shadow-lg shadow-black/10">
                      {/* Glow effect on hover */}
                      <div className={`absolute -inset-px rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-r from-transparent via-${getFrequencyColor(signal.frequency).split(' ')[1].replace('text-','')}-500/10 to-transparent pointer-events-none`}></div>
                      
                      <div className="flex items-start justify-between mb-4 relative z-10">
                          <div className="flex items-center gap-3">
                              <img src={signal.author_avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${signal.author}`} className="w-11 h-11 rounded-full border-2 border-white/5 group-hover:border-white/20 transition-colors" />
                              <div>
                                  <div className="flex items-center gap-2">
                                      <span className="font-bold text-white text-[15px]">@{signal.author}</span>
                                      {signal.role && <span className="text-[11px] bg-white/5 px-2 py-0.5 rounded-full text-slate-400">{signal.role}</span>}
                                  </div>
                                  <div className="text-xs text-slate-500 mt-0.5">{new Date(signal.created_at).toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})}</div>
                              </div>
                          </div>
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full border ${getFrequencyStyle(signal.frequency)}`}>{signal.frequency}</span>
                      </div>
                      
                      <p className="text-slate-200 leading-relaxed whitespace-pre-wrap mb-5 pl-2 border-l-2 border-white/10 font-sans relative z-10">"{renderText(signal)}"</p>
                      
                      <div className="flex items-center gap-6 text-sm text-slate-400 relative z-10">
                          <button onClick={(e) => handleSendSignal(e, signal.id)} className={`flex items-center gap-2 transition-colors ${signal.likes?.some((l:any) => l.user_id === user?.id) ? 'text-indigo-400' : 'hover:text-white'}`}>
                              <Radio className="w-4 h-4" /> {signal.likes?.length || 0}
                          </button>
                          <button className="flex items-center gap-2 hover:text-white transition-colors">
                              <MessageSquare className="w-4 h-4" /> {signal.comments?.length || 0}
                          </button>
                          <button onClick={(e) => handleTranslate(e, signal)} className="ml-auto hover:text-white transition-colors p-1 bg-white/5 rounded-md"><Globe className="w-4 h-4" /></button>
                      </div>
                  </motion.div>
              ))}
          </main>

          {/* SAĞ KAYAR PANEL (Mission & Notifications) */}
          <AnimatePresence>
            {showRightPanel && (
                <motion.aside initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="fixed inset-y-0 right-0 w-full md:w-96 bg-[#0a0a20]/90 backdrop-blur-xl border-l border-white/10 z-[60] p-6 flex flex-col shadow-2xl">
                    <div className="flex justify-between items-center mb-8">
                        <h2 className="text-xl font-bold flex items-center gap-3">
                            {showRightPanel === 'missions' ? <><Briefcase className="w-6 h-6 text-amber-400" /> Missions & Bounties</> : <>Notifications</>}
                        </h2>
                        <button onClick={() => setShowRightPanel(null)} className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors"><X className="w-5 h-5" /></button>
                    </div>

                    {showRightPanel === 'missions' && (
                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 -mr-2 pr-2">
                            <button onClick={() => setIsMissionModalOpen(true)} className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 hover:scale-[1.02] transition-transform mb-4">
                                <Plus className="w-5 h-5" /> Post New Mission
                            </button>
                            {missions.length > 0 ? missions.map((mission) => (
                                <div key={mission.id} onClick={() => setSelectedMission(mission)} className="bg-white/5 border border-white/10 p-4 rounded-2xl hover:bg-white/10 hover:border-amber-500/30 transition-all cursor-pointer group">
                                    <div className="flex justify-between items-start mb-2">
                                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border ${mission.type === 'paid' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>{mission.type}</span>
                                        <span className="text-xs text-slate-500">{new Date(mission.created_at).toLocaleDateString()}</span>
                                    </div>
                                    <h4 className="font-bold text-white mb-1 line-clamp-1 group-hover:text-amber-300 transition-colors">{mission.title}</h4>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className={mission.type === 'paid' ? 'text-emerald-400 font-medium' : 'text-blue-400 font-medium'}>{mission.budget}</span>
                                        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-white" />
                                    </div>
                                </div>
                            )) : <div className="text-center text-slate-500 py-10">No active missions in this sector.</div>}
                        </div>
                    )}
                </motion.aside>
            )}
          </AnimatePresence>
          {showRightPanel && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[55] md:hidden" onClick={() => setShowRightPanel(null)} />}

      </div>

      <AnimatePresence>
        {/* WRITE MODAL (Güncellenmiş Stil) */}
        {isWriting && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
                <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-lg bg-[#0f0f25] border border-white/10 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500"></div>
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-white">Broadcast Signal</h3>
                        <button onClick={() => setIsWriting(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X className="w-5 h-5" /></button>
                    </div>
                    
                    <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar pb-2">
                        {FREQUENCIES.map(freq => (
                            <button key={freq.id} onClick={() => setSelectedFreq(freq)} className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap border ${selectedFreq.id === freq.id ? getFrequencyStyle(freq.id) : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10'}`}>
                                {freq.name}
                            </button>
                        ))}
                    </div>
                    
                    <textarea value={messageText} onChange={e => setMessageText(e.target.value)} placeholder="What message do you send to the void?" className="w-full h-40 bg-white/5 border border-white/10 rounded-2xl p-4 text-white placeholder:text-slate-500 resize-none outline-none focus:border-indigo-500/50 transition-all mb-6" />
                    
                    <button onClick={handleBroadcast} disabled={isSending || !messageText.trim()} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:hover:bg-indigo-600 shadow-lg shadow-indigo-500/20">
                        {isSending ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Send className="w-5 h-5" /> Transmit Signal</>}
                    </button>
                </motion.div>
            </motion.div>
        )}
        
        {/* MISSION MODALS (Aynı mantık, yeni stil) */}
        {isMissionModalOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
                <div className="w-full max-w-md bg-[#0f0f25] border border-white/10 rounded-3xl p-6 space-y-5 relative overflow-hidden shadow-2xl">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 to-orange-500"></div>
                    <div className="flex justify-between items-center"><h3 className="font-bold text-xl text-white">New Mission Brief</h3><button onClick={() => setIsMissionModalOpen(false)} className="p-2 hover:bg-white/10 rounded-full"><X className="w-5 h-5" /></button></div>
                    <input placeholder="Mission Title" value={newMission.title} onChange={e => setNewMission({...newMission, title: e.target.value})} className="w-full bg-white/5 p-4 rounded-xl border border-white/10 outline-none focus:border-amber-500/50 text-white transition-all" />
                    <div className="flex gap-3"><select className="bg-white/5 p-4 rounded-xl flex-1 border border-white/10 outline-none text-white appearance-none focus:border-amber-500/50 transition-all" onChange={e => setNewMission({...newMission, type: e.target.value as any})}><option value="partner" className="bg-[#0f0f25]">Partner</option><option value="paid" className="bg-[#0f0f25]">Paid</option></select><input placeholder="Budget / Equity" className="bg-white/5 p-4 rounded-xl flex-1 border border-white/10 outline-none focus:border-amber-500/50 text-white transition-all" onChange={e => setNewMission({...newMission, budget: e.target.value})} /></div>
                    <textarea placeholder="Mission Description..." className="w-full bg-white/5 p-4 rounded-xl border border-white/10 outline-none h-32 resize-none focus:border-amber-500/50 text-white transition-all" onChange={e => setNewMission({...newMission, description: e.target.value})} />
                    <input placeholder="Contact Email (Secure)" className="w-full bg-white/5 p-4 rounded-xl border border-white/10 outline-none focus:border-amber-500/50 text-white transition-all" onChange={e => setNewMission({...newMission, contact_email: e.target.value})} />
                    <button onClick={handleCreateMission} disabled={isPostingMission} className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-xl hover:scale-[1.02] transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50">{isPostingMission ? "Publishing..." : "Publish Mission"}</button>
                </div>
            </motion.div>
        )}

        {selectedMission && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setSelectedMission(null)}>
                <div className="w-full max-w-lg bg-[#0f0f25] border border-white/10 rounded-3xl p-8 relative shadow-2xl" onClick={e => e.stopPropagation()}>
                    <button className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-full transition-colors" onClick={() => setSelectedMission(null)}><X className="w-5 h-5" /></button>
                    <span className={`text-xs font-bold uppercase tracking-widest mb-3 block ${selectedMission.type === 'paid' ? 'text-emerald-400' : 'text-blue-400'}`}>{selectedMission.type === 'paid' ? 'PAID OPPORTUNITY' : 'PARTNER REQUEST'}</span>
                    <h2 className="text-2xl font-bold mb-2 text-white">{selectedMission.title}</h2>
                    <div className="text-amber-400 font-medium mb-6">{selectedMission.budget}</div>
                    <p className="text-slate-300 leading-relaxed mb-8 whitespace-pre-wrap">{selectedMission.description}</p>
                    <div className="bg-white/5 p-5 rounded-2xl border border-white/10">
                        <div className="text-xs text-slate-500 font-bold uppercase mb-2">Contact Secure Link</div>
                        <div className="text-white font-mono text-sm select-all">{selectedMission.contact_info}</div>
                    </div>
                </div>
            </motion.div>
        )}

        {/* SIGNAL DETAIL MODAL (Yeni Stil) */}
        {selectedSignal && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md" onClick={() => setSelectedSignal(null)}>
                <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-2xl bg-[#0f0f25] border border-white/10 rounded-3xl overflow-hidden flex flex-col max-h-[90vh] shadow-2xl relative" onClick={(e) => e.stopPropagation()}>
                    <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
                        <div className="flex items-center gap-4">
                             <img src={selectedSignal.author_avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${selectedSignal.author}`} className="w-12 h-12 rounded-full border-2 border-white/10" />
                             <div>
                                 <div className="font-bold text-white text-lg">@{selectedSignal.author}</div>
                                 <div className={`text-xs font-bold uppercase tracking-wider ${getFrequencyStyle(selectedSignal.frequency).split(' ')[1]}`}>{selectedSignal.frequency} Sector</div>
                             </div>
                        </div>
                        <button onClick={() => setSelectedSignal(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X className="w-5 h-5" /></button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                        <p className="text-xl leading-relaxed text-white mb-10 whitespace-pre-wrap font-serif pl-4 border-l-4 border-indigo-500/50">"{renderText(selectedSignal)}"</p>
                        
                        <div className="border-t border-white/10 pt-8">
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6">Signal Logs ({selectedSignal.comments?.length || 0})</h4>
                            <div className="space-y-6">
                                {selectedSignal.comments?.map(c => (
                                    <div key={c.id} className="flex gap-4">
                                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-sm font-bold text-slate-300 shrink-0">{c.author?.[0]}</div>
                                        <div>
                                            <div className="text-sm font-bold text-white mb-1">@{c.author} <span className="text-slate-500 text-xs font-normal ml-2">{new Date(c.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span></div>
                                            <p className="text-slate-300 leading-relaxed">{c.content}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="p-4 border-t border-white/10 bg-white/5 flex gap-3">
                        <input value={commentText} onChange={e => setCommentText(e.target.value)} className="flex-1 bg-white/5 border border-white/10 rounded-full px-5 py-3 outline-none text-sm text-white focus:border-indigo-500/50 transition-all placeholder:text-slate-500" placeholder="Reply to signal..." onKeyDown={e => e.key === 'Enter' && handlePostComment(selectedSignal.id)} />
                        <button onClick={() => handlePostComment(selectedSignal.id)} className="p-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full transition-all shadow-lg shadow-indigo-500/20"><Send className="w-5 h-5" /></button>
                    </div>
                </motion.div>
            </motion.div>
        )}

        {/* DAILY QUESTION MODAL (Yeni Stil) */}
         {isDailyOpen && dailyQuestion && (
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md" onClick={() => setIsDailyOpen(false)}>
                <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-4xl max-h-[90vh] bg-[#0f0f25] border border-amber-500/30 rounded-3xl shadow-2xl overflow-hidden flex flex-col relative" onClick={(e) => e.stopPropagation()}>
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 to-orange-500"></div>
                    <div className="p-8 border-b border-white/5 bg-amber-900/10 shrink-0 relative">
                        <div className="flex justify-between items-start mb-4">
                            <div className="text-xs font-bold text-amber-400 uppercase tracking-widest flex items-center gap-2"><Star className="w-4 h-4 fill-current animate-pulse" /> Daily Reflection Topic</div>
                            <button onClick={() => setIsDailyOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X className="w-6 h-6 text-white" /></button>
                        </div>
                        <h2 className="text-2xl md:text-4xl font-serif text-white leading-tight italic text-center py-4">"{dailyQuestion.content}"</h2>
                    </div>
                    <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-black/20">
                        <div className="space-y-4">
                            {dailyResponses.length > 0 ? dailyResponses.map((response) => (
                                <div key={response.id} className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-colors">
                                    <div className="flex items-center gap-3 mb-4">
                                        <img src={response.author_avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${response.author}`} className="w-8 h-8 rounded-full border border-white/10" />
                                        <div className="text-sm font-bold text-white">@{response.author}</div>
                                    </div>
                                    <p className="text-slate-200 text-base leading-relaxed font-serif pl-11 border-l-2 border-amber-500/30">"{renderText(response)}"</p>
                                </div>
                            )) : <div className="text-center py-20 opacity-50 text-sm uppercase tracking-widest">No reflections yet. Be the first light.</div>}
                        </div>
                    </div>
                    <div className="p-6 bg-white/5 border-t border-white/5 shrink-0 flex gap-3">
                         <input type="text" value={dailyResponseText} onChange={(e) => setDailyResponseText(e.target.value)} placeholder="Share your reflection..." className="flex-1 bg-white/5 border border-white/10 rounded-full px-6 py-4 text-sm text-white outline-none focus:border-amber-500/50 transition-all" onKeyDown={(e) => e.key === 'Enter' && handleDailyResponse()} />
                         <button onClick={handleDailyResponse} disabled={isSending || !dailyResponseText.trim()} className="px-6 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-full hover:scale-105 transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 disabled:hover:scale-100"><Send className="w-5 h-5" /></button>
                    </div>
                </motion.div>
             </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}