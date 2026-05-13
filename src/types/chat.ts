export interface AttachedFile {
  id: string;
  name: string;
  extension: string;
  /** byte length */
  size: number;
  /** raw bytes — populated by readFile or File.arrayBuffer() */
  data: Uint8Array;
  /** Keep this document attached for future messages in the same chat */
  persistent?: boolean;
}

export type ResponseStyle = 'concise' | 'explanatory' | 'very-concise' | 'formal' | 'normal';
