export interface AttachedFile {
  id: string;
  name: string;
  extension: string;
  /** byte length */
  size: number;
  /** raw bytes — populated by readFile or File.arrayBuffer() */
  data: Uint8Array;
}
