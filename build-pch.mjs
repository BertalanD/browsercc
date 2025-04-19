#!/usr/bin/env node

import { setUpSysroot, Clang } from "./dist/index.js";
import fs from "node:fs/promises";

const clang = await Clang();

setUpSysroot(clang, await fs.readFile("./sysroot.tar"));

clang.callMain([
  ...(process.argv.slice(2) || []),
  "-x",
  "c++-header",
  "/include/bits/stdc++.h",
  "-o",
  "/include/bits/stdc++.h.pch",
  "-Xclang",
  "-fno-pch-timestamp",
  "-fpch-instantiate-templates",
  "-fdiagnostics-color=always",
]);

await fs.writeFile(
  "stdc++.h.pch",
  clang.FS.readFile("/include/bits/stdc++.h.pch")
);
