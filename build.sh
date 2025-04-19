#!/usr/bin/env bash

set -euo pipefail

BROWSERCC_DIST="${BROWSERCC_DIST:-$(pwd)}"

echo "Building the LLVM toolchain for WASI..."
    git clone --depth 1 --branch llvmorg-20.1.2 https://github.com/llvm/llvm-project.git

    pushd llvm-project
    # FIXME: Enable -DLLVM_ENABLE_LTO=Thin once https://github.com/llvm/llvm-project/pull/136197 is in Emscripten.
    emcmake cmake -Sllvm -Bbuild \
        -GNinja \
        -DCMAKE_BUILD_TYPE="MinSizeRel" \
        -DCMAKE_C_FLAGS="-msimd128 -mbulk-memory" \
        -DCMAKE_CXX_FLAGS="-msimd128 -mbulk-memory" \
        -DCMAKE_EXE_LINKER_FLAGS="-s NO_INVOKE_RUN -s EXIT_RUNTIME -s STACK_SIZE=4194304 -s INITIAL_HEAP=134217728 -s ALLOW_MEMORY_GROWTH -s MODULARIZE -s EXPORT_ES6 -s MALLOC=dlmalloc -s EXPORTED_RUNTIME_METHODS=FS,callMain" \
        -DLLVM_ENABLE_PROJECTS="clang;lld" \
        -DLLVM_HOST_TRIPLE="wasm32-unknown-emscripten" \
        -DLLVM_DEFAULT_TARGET_TRIPLE="wasm32-unknown-wasi" \
        -DLLVM_TARGETS_TO_BUILD="WebAssembly" \
        -DLLVM_ENABLE_THREADS=OFF \
        -DLLVM_BUILD_TOOLS=OFF \
        -DLLVM_INCLUDE_TESTS=OFF \
        -DCLANG_ENABLE_ARCMT=OFF \
        -DCLANG_ENABLE_STATIC_ANALYZER=OFF

    ninja -C build lld clang
    popd

echo "Copying the toolchain..."
    cp llvm-project/build/bin/clang.js-20 "$BROWSERCC_DIST/clang.js"
    cp llvm-project/build/bin/clang.wasm "$BROWSERCC_DIST/clang.wasm"
    cp llvm-project/build/bin/lld.js "$BROWSERCC_DIST/lld.js"
    cp llvm-project/build/bin/lld.wasm "$BROWSERCC_DIST/lld.wasm"

echo "Downloading WASI sysroot..."
    curl -LO 'https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-25/wasi-sysroot-25.0.tar.gz'
    tar -xzf wasi-sysroot-25.0.tar.gz
    curl -LO 'https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-25/libclang_rt.builtins-wasm32-wasi-25.0.tar.gz'
    tar -xzf libclang_rt.builtins-wasm32-wasi-25.0.tar.gz
    mv wasi-sysroot-25.0 sysroot

echo "Packaging the sysroot..."
    pushd sysroot

    # Remove files for other targets
    rm -r include/wasm32-wasi{-threads,p1,p1-threads,p2}
    rm -r lib/wasm32-wasi{-threads,p1,p1-threads,p2}
    rm -r lib/wasm32-wasi/llvm-lto lib/wasm32-wasi/*.so
    rm -r share/
    rm VERSION

    mv include/wasm32-wasi/c++/v1/ include/c++/

    # Copy Clang built-in headers
    mkdir -p lib/clang/20
    cp -r ../llvm-project/build/lib/clang/20/include lib/clang/20

    # Copy builtins library
    mkdir -p lib/clang/20/lib/wasm32-unknown-wasi
    cp ../libclang_rt.builtins-wasm32-wasi-25.0/libclang_rt.builtins-wasm32.a lib/clang/20/lib/wasm32-unknown-wasi/libclang_rt.builtins.a

    mkdir -p include/bits
    cat <<EOF > include/bits/stdc++.h
// A shim around LLVM's libc++ to allow it to be included as a single header like libstdc++.
// TODO: What other useful headers should be included here?

#pragma once

#include <iostream>
#include <string>

#include <array>
#include <deque>
#include <map>
#include <queue>
#include <set>
#include <set>
#include <stack>
#include <unordered_map>
#include <unordered_set>
#include <vector>

#include <algorithm>
#include <numeric>

#include <memory>
#include <random>

#include <assert.h>
#include <math.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
EOF

    tar -cf "$BROWSERCC_DIST/sysroot.tar" *
popd
