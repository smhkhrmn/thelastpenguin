"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Anchor, MapPin, Briefcase, User, Send, Ship, Activity, Link as LinkIcon, X } from 'lucide-react';

interface ProfileSetupProps {
  userId: string;
  onComplete: () => void;
  initialData?: any; // Mevcut verileri içeri almak için ekledik
  isEditing?: boolean; // Düzenleme modunda olup olmadığını anlamak için
}

export default function ProfileSetup({ userId, onComplete, initialData, isEditing }: ProfileSetupProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    username: initialData?.username || '',
    country: initialData?.country || '',
    occupation: initialData?.occupation || '',
    bio: initialData?.bio || '',
    vessel_name: initialData?.vessel_name || '',
    current_status: initialData?.current_status || 'Drifting',
    external_link: initialData?.external_link || ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.username.length < 3) return alert("Nickname must be at least 3 characters!");
    setLoading(true);

    const { error } = await supabase
      .from('profiles')
      .update({
        username: formData.username,
        country: formData.country,
        occupation: formData.occupation,
        bio: formData.bio,
        vessel_name: formData.vessel_name || 'Unidentified Vessel',
        current_status: formData.current_status,
        external_link: formData.external_link,
        is_setup_complete: true
      })
      .eq('id', userId);

    if (error) alert("An error occurred: " + error.message);
    else onComplete();
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/95 backdrop-blur-3xl p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-white/10 rounded-[2.5rem] p-8 shadow-2xl overflow-y-auto max-h-[90vh] relative">
        {isEditing && (
            <button onClick={onComplete} className="absolute top-6 right-6 p-2 hover:bg-white/5 rounded-full">
                <X className="w-5 h-5 text-zinc-500" />
            </button>
        )}
        
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-500/20">
            <Anchor className="text-blue-400 w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold tracking-tighter text-white">
            {isEditing ? "Modify Frequency" : "Identity Confirmation"}
          </h2>
          <p className="text-zinc-500 text-[10px] uppercase tracking-[0.3em] mt-2 font-bold">
            {isEditing ? "Update your vessel coordinates" : "Establish your presence in the void"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
            <input required placeholder="Nickname" value={formData.username} className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm text-white outline-none focus:border-blue-500/50"
              onChange={e => setFormData({...formData, username: e.target.value})} />
          </div>

          <div className="relative">
            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
            <input required placeholder="Sector (Country)" value={formData.country} className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm text-white outline-none focus:border-blue-500/50"
              onChange={e => setFormData({...formData, country: e.target.value})} />
          </div>

          <div className="relative">
            <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
            <input required placeholder="Role (Occupation)" value={formData.occupation} className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm text-white outline-none focus:border-blue-500/50"
              onChange={e => setFormData({...formData, occupation: e.target.value})} />
          </div>

          <div className="relative">
            <Ship className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
            <input placeholder="Vessel Name" value={formData.vessel_name} className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm text-white outline-none focus:border-blue-500/50"
              onChange={e => setFormData({...formData, vessel_name: e.target.value})} />
          </div>

          <div className="relative">
            <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
            <input type="url" placeholder="External Frequency (URL)" value={formData.external_link} className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm text-white outline-none focus:border-blue-500/50"
              onChange={e => setFormData({...formData, external_link: e.target.value})} />
          </div>

          <div className="relative">
            <Activity className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
            <select value={formData.current_status} className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm text-zinc-400 outline-none focus:border-blue-500/50 appearance-none"
              onChange={e => setFormData({...formData, current_status: e.target.value})}>
              <option value="Drifting" className="bg-zinc-900 text-white">Drifting</option>
              <option value="Transmitting" className="bg-zinc-900 text-white">Transmitting</option>
              <option value="Listening" className="bg-zinc-900 text-white">Listening</option>
              <option value="S.O.S" className="bg-zinc-900 text-white">Sending S.O.S</option>
            </select>
          </div>

          <textarea placeholder="Transmission log (Bio)" value={formData.bio} className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-4 text-sm text-white outline-none focus:border-blue-500/50 h-20 resize-none"
            onChange={e => setFormData({...formData, bio: e.target.value})} />

          <button disabled={loading} className="w-full bg-white text-black font-bold py-4 rounded-2xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2">
            {loading ? "PROCESSING..." : isEditing ? "UPDATE FREQUENCY" : "ESTABLISH CONNECTION"}
          </button>
        </form>
      </div>
    </div>
  );
}