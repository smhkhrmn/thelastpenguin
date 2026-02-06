import React from "react";
import { CardStack } from "@/components/CardStack"; // Artık components ana dizinde
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { RefreshCw, Signal, Heart, MessageSquare, ChevronLeft } from "lucide-react";
import DisplayCards from "@/components/ui/display-cards";

const MOCK_LETTERS = [
  {
    id: 1,
    title: "Old Captain",
    description: "Denizin ortasında kaybolmuş gibiyim, pusulam bozuk...",
    date: "Feb 04, 2026",
    status: "replied" as const,
  },
  {
    id: 2,
    title: "Rusty Robot",
    description: "Duygularım paslanmış metal gibi gıcırdıyor bugün.",
    date: "Feb 03, 2026",
    status: "pending" as const,
  },
  {
    id: 3,
    title: "Silent Librarian",
    description: "Sessizlik bazen en gürültülü çığlıktır, değil mi?",
    date: "Jan 28, 2026",
    status: "replied" as const,
  },
];

export default function ProfilePage() {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-black to-black z-0 pointer-events-none" />

      <div className="relative z-10 w-full max-w-2xl flex flex-col items-center gap-12">
        <div className="text-center space-y-2">
            <Link href="/" className="inline-flex items-center text-zinc-500 hover:text-white mb-6 transition-colors text-sm">
                <ArrowLeft className="w-4 h-4 mr-2" /> Back to Home
            </Link>
            <h1 className="text-4xl font-bold bg-gradient-to-b from-white to-zinc-500 bg-clip-text text-transparent">
                Your Memory Stack
            </h1>
            <p className="text-zinc-400">Drag the cards to shuffle through your past echoes.</p>
        </div>

        <div className="flex items-center justify-center w-full py-10">
            <CardStack items={MOCK_LETTERS} />
        </div>
      </div>
    </div>
  );
}