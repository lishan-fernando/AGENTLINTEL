#!/usr/bin/env node
// SPDX-License-Identifier: FSL-1.1-ALv2
"use strict";

const { main } = require("../src/cli");

try {
  process.exit(main());
} catch (error) {
  console.error(`agentlintel internal error: ${error.stack || error}`);
  process.exit(2);
}
