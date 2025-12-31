
type MessageChunk = {
  seq: number;
  text: string;
};
export interface Message {
  id: string;
  role: 'user' | 'model';
  seq?: number;
  text: string;
  chunks?: MessageChunk[];   // 👈 NEW
  audio?: {
    base64: string;
    name: string;
    url: string;
    mimeType: string;
  };
  timestamp?: Date;
}

export interface AudioFile {
  file: File;
  previewUrl: string;
  base64: string;
}
