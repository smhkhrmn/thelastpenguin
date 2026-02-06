"use client";

import { motion } from 'framer-motion';
import { X, Send } from "lucide-react";
import { FREQUENCIES } from "@/types";

interface WriteModalProps {
  isOpen: boolean;
  onClose: () => void;
  messageText: string;
  setMessageText: (text: string) => void;
  onBroadcast: () => void;
  isSending: boolean;
  selectedFreq: any;
  setSelectedFreq: (freq: any) => void;
}

export default function WriteModal({
  isOpen, onClose, messageText, setMessageText, onBroadcast, isSending, selectedFreq, setSelectedFreq
}: WriteModalProps) {
  if (!isOpen) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 100 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div className="w-full max-w-4xl bg-black/80 backdrop-blur-3xl border border-white/10 rounded-[3rem] shadow-2xl flex flex-col md:flex-row overflow-hidden relative">
            <button onClick={onClose} className="absolute top-6 right-6 z-20 p-2 rounded-full bg-white/5 hover:bg-white/20 transition-colors"><X className="w-6 h-6 text-white" /></button>
            <div className="w-full md:w-1/3 bg-white/5 border-r border-white/10 p-8 flex flex-col justify-between">
                <div>
                    <h2 className="text-2xl font-serif mb-6">Select Frequency</h2>
                    <div className="space-y-3">
                        {FREQUENCIES.filter(f => f.id !== 'all').map((freq) => (
                            <button key={freq.id} onClick={() => setSelectedFreq(freq)} className={`w-full flex items-center gap-3 p-4 rounded-2xl border transition-all ${selectedFreq.id === freq.id ? 'bg-white text-black border-white' : 'bg-transparent border-white/10 text-zinc-400 hover:bg-white/5'}`}>
                                <div className={`w-3 h-3 rounded-full ${freq.color}`} /> <span className="text-sm font-bold tracking-wide">{freq.name}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
            <div className="flex-1 p-8 md:p-12 flex flex-col relative">
                <textarea value={messageText} onChange={(e) => setMessageText(e.target.value)} placeholder="What message do you want to leave in the void?" className="w-full h-40 bg-transparent border-none focus:ring-0 text-2xl text-white resize-none font-serif leading-tight outline-none" autoFocus />
                <div className="flex items-center justify-end pt-6 border-t border-white/5">
                    <button onClick={onBroadcast} disabled={isSending || !messageText.trim()} className="flex items-center gap-3 bg-white text-black px-8 py-4 rounded-full font-bold tracking-wide hover:scale-105 transition-transform disabled:opacity-50">
                        {isSending ? <span>TRANSMITTING...</span> : <><span>BROADCAST</span><Send className="w-4 h-4" /></>}
                    </button>
                </div>
            </div>
        </div>
    </motion.div>
  );
}