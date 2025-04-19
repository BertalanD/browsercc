# `browsercc`

Compile C/C++ programs in your browser to [WebAssembly](https://webassembly.org/).

This repository contains build scripts for compiling a [Clang/LLVM](https://github.com/llvm/llvm-project) toolchain to WebAssembly, which can be used to compile C/C++ programs right in the browser. The compiler creates WebAssembly binaries that use the standard [WASI](https://wasi.dev) system interface and can be executed by a simple runtime like [@bjorn3/browser_wasi_shim](https://www.npmjs.com/package/@bjorn3/browser_wasi_shim).

While WASI lacks some features like C++ exceptions and threading support, it requires much less build infrastructure (no Python, shell scripts, etc.) and JavaScript glue code than Emscripten. If you need Emscripten's more advanced features, check out [emception](https://github.com/jprendes/emception).

## Usage

The [NPM release](https://www.npmjs.com/package/browsercc) of `browsercc` contains a precompiled toolchain, but you can also build it yourself with `npm run build`. This uses Docker to create a Linux container with the necessary dependencies, and then calls `build.sh` to compile the toolchain.

`browsercc` provides a JavaScript function for compiling source code given as a string to a WebAssembly module:

```ts
type CompilationJob = {
  source: string;
  fileName: string;
  flags: string[];
  extraFiles?: {
    [fileName: string]: string | ArrayBuffer;
  };
};

type CompilationResult = {
  compileOutput: string;
  module: WebAssembly.Module | null;
};

async function compile(_: CompilationJob): Promise<CompilationResult>;
```

## Package contents

We try to optimize the artifact size as much as possible (except LTO, blocked on https://github.com/llvm/llvm-project/pull/136197), but LLVM is a huge project regardless. The following files are included in the NPM package (uncompressed sizes):

- `index.js` (~5 kB unminified): The main JavaScript file that contains the `compile` function.
- `clang.js`, `lld.js` (70 kB unminified each): The Emscripten glue code for the Clang and LLD binaries.
- `clang.wasm` (43 MB): The main compiler binary.
- `lld.wasm` (23 MB): The linker binary (includes the LLVM backend because of LTO support, could be made smaller).
- `sysroot.tar` (29 MB): C and C++ standard libraries and their headers.
- `stdc++.h.pch` (19 MB): Precompiled header for speeding up C++ STL usage. Only downloaded if `getPrecompiledHeader()` is used.

## Example

The `demo.html` file contains a simple [Compiler Explorer](https://godbolt.org/) like interface for compiling C/C++ programs.
To run it, execute `npm run demo` and open `demo.html` from the link printed in the console.

The bare minimum to compile and run a C++ program is:

```ts
import { compile } from "browsercc";
import { WASI, File, OpenFile, ConsoleStdout } from "@bjorn3/browser_wasi_shim";

const { module, compileOutput } = await compile({
  source: `
#include <iostream>
#include <string>

int main() {
  std::string name;
  std::cin >> name;
  std::cout << "Hello, " << name << "!" << std::endl;
  return 0;
}
`,
  fileName: "main.cpp",
  flags: ["-std=c++20"],
});

// Set up stdin to contain the string "browsercc\n" and capture stdout/stderr in the `output` variable.
const stdin = new TextEncoder().encode("browsercc\n");
let output = "";
const fds = [
  new OpenFile(new File(stdin)),
  new ConsoleStdout((data: Uint8Array) => {
    output += new TextDecoder().decode(data);
  }),
  new ConsoleStdout((data: Uint8Array) => {
    output += new TextDecoder().decode(data);
  }),
];

const wasi = new WASI([], [], fds);
const instance = await WebAssembly.instantiate(module, {
  wasi_snapshot_preview1: wasi.wasiImport,
});
wasi.start(instance);
console.log(output); // "Hello, browsercc!"
```
