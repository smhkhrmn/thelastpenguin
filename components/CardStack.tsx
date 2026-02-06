"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { SquareArrowOutUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type CardStackItem = {
  id: string | number;
  title: string;
  description?: string;
  date?: string;
  status?: "replied" | "pending";
};

type CardStackProps = {
  items: CardStackItem[];
  offset?: number;
  scaleFactor?: number;
};

export function CardStack({
  items,
  offset = 10,
  scaleFactor = 0.06,
}: CardStackProps) {
  const [cards, setCards] = React.useState<CardStackItem[]>(items);

  React.useEffect(() => {
    setCards(items);
  }, [items]);

  const moveToEnd = (from: number) => {
    setCards((move) => {
      const newCards = [...move];
      const movedItem = newCards.splice(from, 1)[0];
      newCards.push(movedItem);
      return newCards;
    });
  };

  return (
    <div className="relative h-60 w-full md:h-60 md:w-96">
      {cards.map((card, index) => {
        return (
          <motion.div
            key={card.id}
            className="absolute h-60 w-full md:h-60 md:w-96 rounded-3xl p-4 shadow-xl border border-white/10 bg-zinc-900/80 backdrop-blur-md flex flex-col justify-between cursor-grab active:cursor-grabbing"
            style={{ transformOrigin: "top center" }}
            animate={{
              top: index * -offset,
              scale: 1 - index * scaleFactor,
              zIndex: cards.length - index,
            }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            onDragEnd={() => moveToEnd(index)}
          >
            <div className="flex justify-between items-start">
                <span className="text-xs font-mono text-zinc-500">{card.date}</span>
                <span className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full border",
                    card.status === 'replied' 
                        ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" 
                        : "text-amber-400 border-amber-500/30 bg-amber-500/10"
                )}>
                    {card.status === 'replied' ? 'REPLIED' : 'PENDING'}
                </span>
            </div>
            <div className="font-serif italic text-zinc-300 text-lg line-clamp-3 opacity-90">
              "{card.description}"
            </div>
            <div className="flex items-center justify-between border-t border-white/10 pt-4 mt-2">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-white">{card.title}</span>
                <span className="text-xs text-zinc-500">Agent</span>
              </div>
              {card.status === 'replied' && (
                  <button className="p-2 rounded-full bg-white text-black hover:bg-zinc-200 transition-colors">
                      <SquareArrowOutUpRight className="w-4 h-4" />
                  </button>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}