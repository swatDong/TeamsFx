// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import "mocha";
import * as chai from "chai";
import fs from "fs-extra";
import sinon from "sinon";
import {
  ConfigMap,
  PluginContext,
  TeamsAppManifest,
  Plugin,
  ok,
  Platform,
} from "@microsoft/teamsfx-api";
import { AppStudioPlugin } from "./../../../../../src/plugins/resource/appstudio";
import { AppStudioPluginImpl } from "./../../../../../src/plugins/resource/appstudio/plugin";
import { TeamsBot } from "./../../../../../src/plugins/resource/bot";
import AdmZip from "adm-zip";
import { newEnvInfo } from "../../../../../src";
import { LocalCrypto } from "../../../../../src/core/crypto";
import { getAzureProjectRoot } from "../helper";

describe("Build Teams Package", () => {
  let plugin: AppStudioPlugin;
  let ctx: PluginContext;
  let BotPlugin: Plugin;
  let selectedPlugins: Plugin[];
  const sandbox = sinon.createSandbox();

  beforeEach(async () => {
    plugin = new AppStudioPlugin();
    ctx = {
      root: getAzureProjectRoot(),
      envInfo: newEnvInfo(),
      config: new ConfigMap(),
      answers: { platform: Platform.VSCode },
      cryptoProvider: new LocalCrypto(""),
    };
    ctx.projectSettings = {
      appName: "my app",
      projectId: "project id",
      solutionSettings: {
        name: "azure",
        version: "1.0",
        capabilities: ["Bot"],
        activeResourcePlugins: ["fx-resource-bot"],
      },
    };
    const botplugin: Plugin = new TeamsBot();
    BotPlugin = botplugin as Plugin;
    BotPlugin.name = "fx-resource-bot";
    BotPlugin.displayName = "Bot";
    selectedPlugins = [BotPlugin];
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("Check teams app id", async () => {
    sandbox.stub(AppStudioPluginImpl.prototype, "getConfigForCreatingManifest" as any).returns(
      ok({
        tabEndpoint: "tabEndpoint",
        tabDomain: "tabDomain",
        aadId: "aadId",
        botDomain: "botDomain",
        botId: "botId",
        webApplicationInfoResource: "webApplicationInfoResource",
        teamsAppId: "teamsAppId",
      })
    );
    sandbox.stub(fs, "move").resolves();

    const builtPackage = await plugin.buildTeamsPackage(ctx);
    chai.assert.isTrue(builtPackage.isOk());
    if (builtPackage.isOk()) {
      chai.assert.isNotEmpty(builtPackage.value);
      const zip = new AdmZip(builtPackage.value);
      const appPackage = `${ctx.root}/appPackage`;
      zip.extractEntryTo("manifest.json", appPackage);
      const manifestFile = `${appPackage}/manifest.json`;
      chai.assert.isTrue(await fs.pathExists(manifestFile));
      const manifest: TeamsAppManifest = await fs.readJSON(manifestFile);
      chai.assert.equal(manifest.id, "teamsAppId");
      await fs.remove(builtPackage.value);
      await fs.remove(manifestFile);
    }
  });
});
