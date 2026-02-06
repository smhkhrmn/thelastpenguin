"use client";

import { motion, PanInfo } from 'framer-motion';
import { Globe, Radio, MessageSquare, User } from "lucide-react";
import { SignalData, FREQUENCIES } from "@/types";
import { useRouter } from 'next/navigation';

interface SignalCardProps {
  signal: SignalData;
  style: any;
  user: any;
  onDragEnd: (event: any, info: PanInfo) => void;
  onExpand: () => void;
  onLike: (e: any, id: number) => void;
  onTranslate: (e: any, signal: SignalData) => void;
  isTranslated: boolean;
  isGlobalEnglish: boolean;
}

export default function SignalCard({ 
  signal, style, user, onDragEnd, onExpand, onLike, onTranslate, isTranslated, isGlobalEnglish 
}: SignalCardProps) {
  const router = useRouter();
  const hasLiked = signal.likes?.some((l: any) => l.user_id === user?.id);
  
  // Metin gösterme mantığı
  const displayContent = ((isGlobalEnglish || isTranslated) && signal.translation) 
    ? signal.translation 
    : signal.content;

  const getFrequencyColor = (freqId: string) => {
    const freq = FREQUENCIES.find(f => f.id === freqId);
    return freq ? `text-[${freq.color.replace('bg-', '')}] border-[${freq.color.replace('bg-', '')}]/50` : 'text-zinc-400 border-white/10';
  };

  return (
    <motion.div
      animate={style}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.2}
      dragSnapToOrigin={true}
      onDragEnd={onDragEnd}
      transition={{ duration: 0.6, type: "spring", stiffness: 100 }}
      className="absolute w-full max-w-2xl cursor-pointer select-none touch-action-none"
      onClick={onExpand}
    >
      <div className="relative bg-black/40 border backdrop-blur-2xl rounded-[2rem] shadow-2xl overflow-hidden group transition-all flex flex-col h-full max-h-[500px] border-white/10">
        <div className="p-8 pb-4">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3 group/author" onClick={(e) => { e.stopPropagation(); router.push(`/profile/${encodeURIComponent(signal.author)}`); }}>
              <div className="w-10 h-10 rounded-full overflow-hidden border border-white/10 bg-white/5">
                <img src={signal.author_avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${signal.author}`} className="w-full h-full object-cover" alt="Avatar" />
              </div>
              <div>
                <div className="text-sm font-bold text-white group-hover/author:text-blue-400 transition-colors">{signal.author}</div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-widest">{signal.author_occupation} • {signal.author_country}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={(e) => onTranslate(e, signal)} className={`p-2 rounded-full border transition-all z-20 ${isTranslated ? 'bg-white text-black border-white' : 'bg-transparent text-zinc-500 border-white/10 hover:text-white'}`}>
                <Globe className="w-3.5 h-3.5" />
              </button>
              <button onClick={(e) => onLike(e, signal.id)} className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 px-2 py-1 rounded-md transition-all group/radar">
                <div className="relative flex items-center justify-center">
                  <Radio className={`w-3.5 h-3.5 ${hasLiked ? 'text-blue-400' : 'text-zinc-500'}`} />
                  {hasLiked && <span className="absolute inset-0 animate-ping bg-blue-400/40 rounded-full"></span>}
                </div>
                <span className="text-[9px] font-bold text-zinc-400 group-hover/radar:text-white">{signal.likes?.length || 0}</span>
              </button>
              <div className={`text-[9px] font-bold px-2 py-1 rounded border text-zinc-400 border-white/10`}>{signal.frequency?.toUpperCase()}</div>
            </div>
          </div>
          <p className="text-xl md:text-2xl font-serif text-zinc-200 line-clamp-3 mt-4">"{displayContent}"</p>
        </div>
        <div className="flex-1 bg-black/20 p-6 pb-20 border-t border-white/5 flex flex-col gap-4">
          {signal.comments && signal.comments.length > 0 ? (
            signal.comments.slice(-2).map((comment: any) => (
              <div key={comment.id} className="flex items-start gap-3 opacity-60">
                <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center mt-1"><User className="w-3 h-3 text-zinc-500" /></div>
                <div className="bg-white/5 rounded-2xl p-3 px-4 max-w-[90%]">
                  <div className="text-[10px] text-zinc-500 font-bold mb-1">{comment.author}</div>
                  <p className="text-sm text-zinc-300 leading-relaxed line-clamp-1">{comment.content}</p>
                </div>
              </div>
            ))
          ) : (
            <div className="flex items-center justify-center h-full opacity-30 gap-2 text-zinc-500 text-xs uppercase tracking-widest">
              <MessageSquare className="w-4 h-4" /><span>Static noise...</span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}