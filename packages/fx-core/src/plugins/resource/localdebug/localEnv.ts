// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
"use strict";

import * as dotenv from "dotenv";
import * as fs from "fs-extra";
import * as os from "os";
import { ConfigFolderName } from "@microsoft/teamsfx-api";

import {
  LocalEnvFrontendKeys,
  LocalEnvBackendKeys,
  LocalEnvAuthKeys,
  LocalEnvBotKeys,
  LocalEnvBotKeysMigratedFromV1,
} from "./constants";

// Manage local envs for legacy project. For multi-env supported one, see `localEnvMulti.ts`.
export class LocalEnvProvider {
  private readonly localEnvFilePath: string;
  constructor(workspaceFolder: string) {
    this.localEnvFilePath = `${workspaceFolder}/.${ConfigFolderName}/local.env`;
  }

  public async loadLocalEnv(
    includeFrontend: boolean,
    includeBackend: boolean,
    includeBot: boolean,
    includeAuth: boolean,
    isMigrateFromV1: boolean
  ): Promise<{ [name: string]: string }> {
    if (await fs.pathExists(this.localEnvFilePath)) {
      return dotenv.parse(await fs.readFile(this.localEnvFilePath));
    } else {
      return this.initialLocalEnvs(
        includeFrontend,
        includeBackend,
        includeBot,
        includeAuth,
        isMigrateFromV1
      );
    }
  }

  public async saveLocalEnv(envs: { [name: string]: string } | undefined): Promise<void> {
    await fs.createFile(this.localEnvFilePath);
    await fs.writeFile(this.localEnvFilePath, "");
    if (envs) {
      const entries = Object.entries(envs);
      for (const [key, value] of entries) {
        await fs.appendFile(this.localEnvFilePath, `${key}=${value}${os.EOL}`);
      }
    }
  }

  public initialLocalEnvs(
    includeFrontend: boolean,
    includeBackend: boolean,
    includeBot: boolean,
    includeAuth: boolean,
    isMigrateFromV1: boolean
  ): { [name: string]: string } {
    const localEnvs: { [name: string]: string } = {};
    let keys: string[];

    if (includeFrontend) {
      if (includeAuth) {
        // auth is only required by frontend
        keys = Object.values(LocalEnvAuthKeys);
        for (const key of keys) {
          // initial with empty string
          localEnvs[key] = "";
        }
        // setup const environment variables
        localEnvs[LocalEnvAuthKeys.Urls] = "http://localhost:5000";
        keys = Object.values(LocalEnvFrontendKeys);
        for (const key of keys) {
          // initial with empty string
          localEnvs[key] = "";
        }
      }

      // setup const environment variables
      localEnvs[LocalEnvFrontendKeys.Browser] = "none";
      localEnvs[LocalEnvFrontendKeys.Https] = "true";

      if (includeBackend) {
        keys = Object.values(LocalEnvBackendKeys);
        for (const key of keys) {
          // initial with empty string
          localEnvs[key] = "";
        }

        // setup const environment variables
        localEnvs[LocalEnvBackendKeys.FuncWorkerRuntime] = "node";
      }
    }

    if (includeBot) {
      keys = isMigrateFromV1
        ? Object.values(LocalEnvBotKeysMigratedFromV1)
        : Object.values(LocalEnvBotKeys);
      for (const key of keys) {
        // initial with empty string
        localEnvs[key] = "";
      }
    }

    return localEnvs;
  }
}
