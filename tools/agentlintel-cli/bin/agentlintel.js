#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
"use strict";

const { main } = require("../src/cli");

try {
  process.exit(main());
} catch (error) {
  console.error(`agentlintel internal error: ${error.stack || error}`);
  process.exit(2);
}
