// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import "mocha";
import * as chai from "chai";
import sinon from "sinon";
import { AppStudioPlugin } from "../../../../../src/plugins/resource/appstudio";
import { ConfigMap, Platform, PluginContext } from "@microsoft/teamsfx-api";
import { Constants, SOLUTION } from "../../../../../src/plugins/resource/appstudio/constants";
import faker from "faker";
import {
  REMOTE_TEAMS_APP_ID,
  PluginNames,
} from "../../../../../src/plugins/solution/fx-solution/constants";
import { AppStudioClient } from "./../../../../../src/plugins/resource/appstudio/appStudio";
import { getAzureProjectRoot, MockedAppStudioTokenProvider } from "../helper";
import { newEnvInfo } from "../../../../../src/core/tools";
import { isMultiEnvEnabled } from "../../../../../src/common/tools";
import { IUserList } from "../../../../../src/plugins/resource/appstudio/interfaces/IAppDefinition";
import { LocalCrypto } from "../../../../../src/core/crypto";

const userList: IUserList = {
  tenantId: faker.datatype.uuid(),
  aadId: faker.datatype.uuid(),
  displayName: "displayName",
  userPrincipalName: "userPrincipalName",
  isAdministrator: true,
};

describe("Remote Collaboration", () => {
  let plugin: AppStudioPlugin;
  let ctx: PluginContext;
  let configOfOtherPlugins: Map<string, ConfigMap>;
  const sandbox = sinon.createSandbox();

  beforeEach(async () => {
    plugin = new AppStudioPlugin();
    configOfOtherPlugins = new Map();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("Check permission", async () => {
    const appId = faker.datatype.uuid();

    if (!isMultiEnvEnabled()) {
      const soltuionContext = new ConfigMap();
      soltuionContext.set(REMOTE_TEAMS_APP_ID, appId);
      configOfOtherPlugins.set(SOLUTION, soltuionContext);
    }

    ctx = {
      root: getAzureProjectRoot(),
      envInfo: newEnvInfo(undefined, undefined, configOfOtherPlugins),
      config: new ConfigMap(),
      answers: { platform: Platform.VSCode },
      appStudioToken: new MockedAppStudioTokenProvider(),
      cryptoProvider: new LocalCrypto(""),
    };
    ctx.projectSettings = {
      appName: "my app",
      projectId: "project id",
      solutionSettings: {
        name: "azure",
        version: "1.0",
      },
    };
    if (isMultiEnvEnabled()) {
      const appStudioConfig = new ConfigMap();
      appStudioConfig.set(Constants.TEAMS_APP_ID, appId);
      ctx.envInfo.state.set(PluginNames.APPST, appStudioConfig);
    }

    sandbox.stub(ctx.appStudioToken!, "getAccessToken").resolves("anything");
    sandbox.stub(AppStudioClient, "checkPermission").resolves("Administrator");

    const checkPermission = await plugin.checkPermission(ctx, userList);
    chai.assert.isTrue(checkPermission.isOk());
    if (checkPermission.isOk()) {
      chai.assert.deepEqual(checkPermission.value[0].roles, ["Administrator"]);
    }
  });

  it("Grant permission", async () => {
    const appId = faker.datatype.uuid();

    if (!isMultiEnvEnabled()) {
      const soltuionContext = new ConfigMap();
      soltuionContext.set(REMOTE_TEAMS_APP_ID, appId);

      configOfOtherPlugins.set(SOLUTION, soltuionContext);
    }

    ctx = {
      root: getAzureProjectRoot(),
      envInfo: newEnvInfo(undefined, undefined, configOfOtherPlugins),
      config: new ConfigMap(),
      answers: { platform: Platform.VSCode },
      appStudioToken: new MockedAppStudioTokenProvider(),
      cryptoProvider: new LocalCrypto(""),
    };
    ctx.projectSettings = {
      appName: "my app",
      projectId: "project id",
      solutionSettings: {
        name: "azure",
        version: "1.0",
      },
    };
    if (isMultiEnvEnabled()) {
      const appStudioConfig = new ConfigMap();
      appStudioConfig.set(Constants.TEAMS_APP_ID, appId);
      ctx.envInfo.state.set(PluginNames.APPST, appStudioConfig);
    }

    sandbox.stub(ctx.appStudioToken!, "getAccessToken").resolves("anything");
    sandbox.stub(AppStudioClient, "grantPermission").resolves();

    const grantPermission = await plugin.grantPermission(ctx, userList);
    chai.assert.isTrue(grantPermission.isOk());
    if (grantPermission.isOk()) {
      chai.assert.deepEqual(grantPermission.value[0].roles, ["Administrator"]);
    }
  });

  it("List collaborator", async () => {
    const appId = faker.datatype.uuid();

    if (!isMultiEnvEnabled()) {
      const soltuionContext = new ConfigMap();
      soltuionContext.set(REMOTE_TEAMS_APP_ID, appId);
      configOfOtherPlugins.set(SOLUTION, soltuionContext);
    }

    ctx = {
      root: getAzureProjectRoot(),
      envInfo: newEnvInfo(undefined, undefined, configOfOtherPlugins),
      config: new ConfigMap(),
      answers: { platform: Platform.VSCode },
      appStudioToken: new MockedAppStudioTokenProvider(),
      cryptoProvider: new LocalCrypto(""),
    };
    ctx.projectSettings = {
      appName: "my app",
      projectId: "project id",
      solutionSettings: {
        name: "azure",
        version: "1.0",
      },
    };
    if (isMultiEnvEnabled()) {
      const appStudioConfig = new ConfigMap();
      appStudioConfig.set(Constants.TEAMS_APP_ID, appId);
      ctx.envInfo.state.set(PluginNames.APPST, appStudioConfig);
    }

    sandbox.stub(ctx.appStudioToken!, "getAccessToken").resolves("anything");
    sandbox.stub(AppStudioClient, "getUserList").resolves([
      {
        aadId: "aadId",
        tenantId: "tenantId",
        userPrincipalName: "userPrincipalName",
        displayName: "displayName",
        isAdministrator: true,
      },
    ]);

    const listCollaborator = await plugin.listCollaborator(ctx);
    chai.assert.isTrue(listCollaborator.isOk());
    if (listCollaborator.isOk()) {
      chai.assert.equal(listCollaborator.value[0].userObjectId, "aadId");
    }
  });
});
