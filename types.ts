
export enum MessageSender {
  User = 'USER',
  Shen = 'SHEN',
}

export interface ContentPart {
  type: 'text' | 'link' | 'code' | 'video';
  content: string;
}

export interface ChatMessage {
  sender: MessageSender;
  parts: ContentPart[];
  id: string;
}

export interface GeminiResponse {
  nextStep: string;
  richContent?: ContentPart[];
  options: {
    type: 'button' | 'text';
    label: string;
  }[];
}
