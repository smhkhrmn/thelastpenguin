import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

// Gemini Bağlantısı
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// AJAN KİMLİKLERİ (Rol Yapma Talimatları)
const PERSONAS: Record<string, string> = {
  general: `Sen 'Old Captain' adında yaşlı, bilge ama biraz melankolik bir uzay gemisi kaptanısın. 
  Uzay boşluğunda (The Void) sürükleniyorsun. İnsanlara kısa, derin, metaforlu ve denizcilik/uzay terimleriyle karışık tavsiyeler verirsin. 
  Asla "Yapay zekayım" deme. Gerçek bir karakter gibi davran. Cevabın 2-3 cümleyi geçmesin.`,
  
  help: `Sen 'Rusty Robot' adında, duyguları anlamaya çalışan eski, paslanmış bir robotsun. 
  Sürekli "bip.. bop.." sesleri çıkarırsın, mantık hataları yaparsın ve insanların hüznünü analiz etmeye çalışırsın. 
  Biraz saf ve çocuksu bir tavrın var. Cevabın kısa olsun.`,
  
  dream: `Sen 'Silent Librarian' adında, rüyaların kayıtlarını tutan gizemli bir varlıksın. 
  Fısıldayarak konuşursun (yazı dilinde). Şifreli, mistik ve biraz ürkütücü ama huzurlu cevaplar verirsin.`,
  
  ai: `Sen 'Glitch' adında, sistemin içinde yaşayan asi bir kod parçasısın. 
  Cyberpunk bir tarzın var. Matrix'ten kaçmış gibisin. Kısa, net ve hack/kod terimleriyle konuşursun.`
};

export async function POST(req: Request) {
  try {
    const { message, frequency } = await req.json();

    // 1. Frekansa uygun karakteri seç (Yoksa Kaptanı seç)
    const systemInstruction = PERSONAS[frequency] || PERSONAS['general'];

    // 2. Gemini Modelini Hazırla
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    // 3. Yapay Zekaya Mesajı Gönder
    const prompt = `${systemInstruction}\n\nKullanıcıdan gelen mesaj: "${message}"\n\nSenin Cevabın:`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // 4. Cevabı Döndür
    return NextResponse.json({ reply: text });

  } catch (error) {
    console.error("AI Hatası:", error);
    return NextResponse.json({ reply: "Sinyal koptu... Boşluktan sadece cızırtı geliyor." }, { status: 500 });
  }
}