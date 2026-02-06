export interface SignalData {
    id: number;
    content: string;
    translation?: string;
    author: string;
    frequency: string;
    created_at: string;
    author_avatar?: string;
    author_country?: string;
    author_occupation?: string;
    likes?: any[];
    comments?: any[];
    daily_question_id?: number;
    role?: string;
    distance?: string;
}
  
export interface MissionData {
    id: number;
    title: string;
    description: string;
    type: 'partner' | 'paid';
    budget: string;
    created_at: string;
    contact_info: string;
    user_id: string;
}

export const FREQUENCIES = [
    { id: 'all', name: 'All Frequencies', color: 'bg-zinc-500' },
    { id: 'general', name: 'Open Void', color: 'bg-white' },
    { id: 'help', name: 'S.O.S Signal', color: 'bg-red-500' },
    { id: 'dream', name: 'Dream Log', color: 'bg-purple-500' },
    { id: 'ai', name: 'AI Nexus', color: 'bg-blue-500' },
];