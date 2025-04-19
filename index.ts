import Clang from "./clang.js";
import LLD from "./lld.js";

export { Clang, LLD };

export type FileList = Record<string, string | ArrayBuffer>;

export type CompilationJob = {
  source: string;
  fileName: string;
  flags: string[];
  extraFiles?: FileList;
};

export type CompilationResult = {
  compileOutput: string;
  module: WebAssembly.Module | null;
};

export type Invocation = {
  compilerArgs: string[];
  compilerArtifact: string;
  linkerArgs: string[];
  linerArtifact: string;
};

export function* tarContents(
  contents: ArrayBuffer
): Generator<{ name: string; content: Uint8Array }> {
  const data = new Uint8Array(contents);
  let offset = 0;

  const textDecoder = new TextDecoder("utf-8");

  while (offset + 512 <= data.length) {
    const header = data.slice(offset, offset + 512);
    const name = textDecoder.decode(header.slice(0, 100)).replace(/\0.*$/, "");
    if (!name) break; // two empty blocks mean end of archive

    const sizeOctal = textDecoder
      .decode(header.slice(124, 136))
      .replace(/\0.*$/, "")
      .trim();
    const size = parseInt(sizeOctal, 8) || 0;

    const contentStart = offset + 512;
    const contentEnd = contentStart + size;
    const content = data.slice(contentStart, contentEnd);

    yield { name, content };

    // advance to next file, rounding up to next 512 bytes
    const totalSize = 512 + Math.ceil(size / 512) * 512;
    offset += totalSize;
  }
}

export function setUpSysroot(
  module: any,
  tar: ArrayBuffer,
  extraFiles?: FileList
) {
  for (const { name, content } of tarContents(tar)) {
    if (name.endsWith("/")) continue;

    const dirName = name.split("/").slice(0, -1).join("/");
    if (!module.FS.analyzePath(dirName).exists) {
      module.FS.mkdirTree(dirName);
    }
    module.FS.writeFile(name, content);
  }

  if (extraFiles) {
    for (const [name, content] of Object.entries(extraFiles)) {
      const dirName = name.split("/").slice(0, -1).join("/");
      module.FS.mkdirTree(dirName);
      if (typeof content === "string") {
        module.FS.writeFile(name, content);
      } else {
        module.FS.writeFile(name, new Uint8Array(content));
      }
    }
  }
}

// TODO: Executing the Clang driver just to get the flags is expensive (~80ms).
//       Reimplement the Clang driver's most common options in TS.
export async function getCompilerInvocation(
  inputName: string,
  inputFile: string,
  flags: string[]
): Promise<Invocation> {
  let stderr = "";
  const clang = await Clang({
    thisProgram: "clang++",
    printErr: (data: string) => {
      stderr += data + "\n";
    },
  });
  clang.FS.writeFile(inputName, inputFile);

  // Set up a dummy sysroot so the compiler driver finds the paths it needs.
  clang.FS.mkdirTree("/lib/wasm32-wasi");
  clang.FS.mkdirTree("/include/c++/v1");
  clang.FS.writeFile("/lib/wasm32-wasi/crt1-command.o", new Uint8Array(0));
  clang.FS.writeFile("/lib/wasm32-wasi/crt1-reactor.o", new Uint8Array(0));

  const ret = clang.callMain([inputName, ...flags, "-###"]);
  if (ret !== 0) {
    console.error(stderr);
    throw new Error(`Clang driver failed with code ${ret}`);
  }

  const lines = stderr.split("\n");

  const getArgs = (key: string) => {
    const line = lines.find((line) => line.includes(key)) ?? "";
    const args = line
      .match(/"([^"]*)"/g)!
      .map((s) => s.slice(1, -1))
      .slice(1);
    const oIndex = args.findIndex((arg) => arg === "-o");
    return { args, outputFileName: args[oIndex + 1] };
  };

  const cc1line = getArgs("-cc1");
  const linkerLine = getArgs("wasm-ld");
  return {
    compilerArgs: cc1line.args,
    compilerArtifact: cc1line.outputFileName,
    linkerArgs: linkerLine.args,
    linerArtifact: linkerLine.outputFileName,
  };
}

export async function compile({
  source,
  fileName,
  flags,
  extraFiles,
}: CompilationJob): Promise<CompilationResult> {
  let stderr = "";
  const clangPromise = Clang({
    thisProgram: "clang++",
    printErr: (data: string) => {
      stderr += data + "\n";
    },
  });
  const lldPromise = LLD({
    thisProgram: "wasm-ld",
    printErr: (data: string) => {
      stderr += data + "\n";
    },
  });
  const sysroot = await (
    await fetch(new URL("sysroot.tar", import.meta.url).href)
  ).arrayBuffer();

  const invocation = await getCompilerInvocation(fileName, source, flags);

  const clang = await clangPromise;
  clang.FS.writeFile(fileName, source);
  setUpSysroot(clang, sysroot, extraFiles);

  let exitCode = clang.callMain(invocation.compilerArgs);

  if (exitCode !== 0) {
    return {
      compileOutput: stderr,
      module: null,
    };
  }

  const binary = clang.FS.readFile(invocation.compilerArtifact, {
    encoding: "binary",
  });

  const lld = await lldPromise;
  lld.FS.writeFile(invocation.compilerArtifact, binary);
  setUpSysroot(lld, sysroot, extraFiles);

  exitCode = lld.callMain(invocation.linkerArgs);

  if (exitCode !== 0) {
    return {
      compileOutput: stderr,
      module: null,
    };
  }

  const output: Uint8Array = lld.FS.readFile(invocation.linerArtifact, {
    encoding: "binary",
  });

  return {
    compileOutput: stderr,
    module: await WebAssembly.compile(output),
  };
}
