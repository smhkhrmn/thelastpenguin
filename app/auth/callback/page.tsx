'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    // Supabase, URL'deki karmaşık kodları (hash) otomatik okur.
    // Bizim yapmamız gereken tek şey, işlem bitince ana sayfaya atmak.
    const handleAuth = async () => {
      // Oturumun kurulmasını bekle
      const { data, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error('Giriş hatası:', error.message);
        alert('Giriş yapılamadı: ' + error.message);
      }
      
      // Her şey tamamsa ana sayfaya yolla
      router.push('/');
    };

    handleAuth();
  }, [router]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-black text-white font-mono">
        <div className="flex flex-col items-center gap-4">
            {/* Yükleniyor animasyonu */}
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-white border-t-transparent" />
            <p className="animate-pulse text-xs tracking-[0.3em] uppercase opacity-70">
                Verifying Identity...
            </p>
        </div>
    </div>
  );
}