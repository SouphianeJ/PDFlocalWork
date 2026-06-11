export type SortKey = "name" | "type" | "date";

export type RotationDegrees = 0 | 90 | 180 | 270;

export type PreviewState = {
  fileName: string;
  fileType: "pdf" | "image";
  src: string;
};

export type PathSuggestion = {
  name: string;
  path: string;
  completion: string;
};

export type SourceDeletePrompt = {
  outputFile: string;
  fileNames: string[];
  kind: "merge" | "compress";
};
