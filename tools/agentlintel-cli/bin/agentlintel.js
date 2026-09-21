#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-AgentLintel-Free-Use-No-Resale-1.0
"use strict";

const { main } = require("../src/cli");

Promise.resolve()
  .then(() => main())
  .then((code) => { process.exitCode = code; })
  .catch((error) => {
    console.error(`agentlintel internal error: ${error.stack || error}`);
    process.exitCode = 2;
  });
