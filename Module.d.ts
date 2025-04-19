export type ModuleCtor = (args?: ModuleArgs) => Promise<Module>;

export interface ModuleArgs {
  thisProgram?: string;
  printErr?: (data: string) => void;
}

export interface Module {
  FS: {
    mkdirTree: (path: string) => void;
    writeFile: (path: string, content: Uint8Array | string) => void;
    readFile: (
      path: string,
      options?: { encoding?: "binary" | "utf8" }
    ) => Uint8Array;
    analyzePath: (path: string) => { exists: boolean };
  };
  callMain: (args: string[]) => number;
}
