import type { ChatMessage } from './types';

export type LobbyState = {
  chat: ChatMessage[];
};

export const CitadelChatLobby = {
  name: 'citadel-lobby',
  setup: (): LobbyState => ({ chat: [] }),
  moves: {
    submitChat: ({ G }: any, payload: { sender: string; text: string } | string) => {
      const msg = typeof payload === 'string'
        ? { sender: 'System', text: payload }
        : payload;
      const next: ChatMessage = { ...msg, timestamp: Date.now() };
      G.chat.push(next);
      if (G.chat.length > 50) G.chat.shift();
    },
  },
} as const;
