
export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  audio?: {
    base64: string;
    name: string;
    url: string;
    mimeType: string;
  };
  timestamp: Date;
}

export interface AudioFile {
  file: File;
  previewUrl: string;
  base64: string;
}
