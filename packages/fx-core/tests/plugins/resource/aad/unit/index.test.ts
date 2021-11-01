// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import "mocha";
import * as chai from "chai";
import * as dotenv from "dotenv";
import { PluginContext } from "@microsoft/teamsfx-api";
import { AadAppForTeamsPlugin } from "../../../../../src/plugins/resource/aad/index";
import {
  mockTokenProviderAzure,
  mockProvisionResult,
  mockTokenProvider,
  TestHelper,
  mockTokenProviderAzureGraph,
  mockTokenProviderGraph,
  mockSkipFlag,
} from "../helper";
import sinon from "sinon";
import { AadAppClient } from "../../../../../src/plugins/resource/aad/aadAppClient";
import { getAppStudioToken, getGraphToken } from "../tokenProvider";
import { ConfigKeys } from "../../../../../src/plugins/resource/aad/constants";
import { ProvisionConfig } from "../../../../../src/plugins/resource/aad/utils/configs";
import faker from "faker";
import { IUserList } from "../../../../../src/plugins/resource/appstudio/interfaces/IAppDefinition";

dotenv.config();
const testWithAzure: boolean = process.env.UT_TEST_ON_AZURE ? true : false;

const userList: IUserList = {
  tenantId: faker.datatype.uuid(),
  aadId: faker.datatype.uuid(),
  displayName: "displayName",
  userPrincipalName: "userPrincipalName",
  isAdministrator: true,
};

describe("AadAppForTeamsPlugin: CI", () => {
  let plugin: AadAppForTeamsPlugin;
  let context: PluginContext;

  beforeEach(async () => {
    plugin = new AadAppForTeamsPlugin();
    sinon.stub(AadAppClient, "createAadApp").resolves();
    sinon.stub(AadAppClient, "createAadAppSecret").resolves();
    sinon.stub(AadAppClient, "updateAadAppRedirectUri").resolves();
    sinon.stub(AadAppClient, "updateAadAppIdUri").resolves();
    sinon.stub(AadAppClient, "updateAadAppPermission").resolves();
    sinon.stub(AadAppClient, "getAadApp").resolves(new ProvisionConfig());
    sinon.stub(AadAppClient, "checkPermission").resolves(true);
    sinon.stub(AadAppClient, "grantPermission").resolves();
    sinon.stub(AadAppClient, "listCollaborator").resolves([
      {
        userObjectId: "id",
        displayName: "displayName",
        userPrincipalName: "userPrincipalName",
        resourceId: "resourceId",
      },
    ]);
  });

  afterEach(() => {
    sinon.restore();
  });

  it("provision: tab", async function () {
    context = await TestHelper.pluginContext(new Map(), true, false, false);
    context.appStudioToken = mockTokenProvider();
    context.graphTokenProvider = mockTokenProviderGraph();

    const provision = await plugin.provision(context);
    chai.assert.isTrue(provision.isOk());

    mockProvisionResult(context);
    const setAppId = plugin.setApplicationInContext(context);
    chai.assert.isTrue(setAppId.isOk());

    const postProvision = await plugin.postProvision(context);
    chai.assert.isTrue(postProvision.isOk());
  });

  it("provision: skip provision", async function () {
    context = await TestHelper.pluginContext(new Map(), true, false, false);
    context.appStudioToken = mockTokenProvider();
    context.graphTokenProvider = mockTokenProviderGraph();
    mockSkipFlag(context);

    const provision = await plugin.provision(context);
    chai.assert.isTrue(provision.isOk());
  });

  it("provision: tab and bot", async function () {
    context = await TestHelper.pluginContext(new Map(), true, true, false);
    context.appStudioToken = mockTokenProvider();
    context.graphTokenProvider = mockTokenProviderGraph();

    const provision = await plugin.provision(context);
    chai.assert.isTrue(provision.isOk());

    mockProvisionResult(context);
    const setAppId = plugin.setApplicationInContext(context);
    chai.assert.isTrue(setAppId.isOk());

    const postProvision = await plugin.postProvision(context);
    chai.assert.isTrue(postProvision.isOk());
  });

  it("provision: none input and fix", async function () {
    context = await TestHelper.pluginContext(new Map(), false, false, false);
    context.appStudioToken = mockTokenProvider();
    context.graphTokenProvider = mockTokenProviderGraph();

    const provision = await plugin.provision(context);
    chai.assert.isTrue(provision.isOk());

    mockProvisionResult(context, false, false);
    const setAppId = plugin.setApplicationInContext(context);
    chai.assert.isTrue(setAppId.isErr());

    context = await TestHelper.pluginContext(context.config, true, false, false);
    context.appStudioToken = mockTokenProvider();
    context.graphTokenProvider = mockTokenProviderGraph();

    const provisionSecond = await plugin.provision(context);
    chai.assert.isTrue(provisionSecond.isOk());

    mockProvisionResult(context, false, true);
    const setAppIdSecond = plugin.setApplicationInContext(context);
    chai.assert.isTrue(setAppIdSecond.isOk());

    const postProvision = await plugin.postProvision(context);
    chai.assert.isTrue(postProvision.isOk());
  });

  it("local debug: tab and bot", async function () {
    context = await TestHelper.pluginContext(new Map(), true, true, true);
    context.appStudioToken = mockTokenProvider();
    context.graphTokenProvider = mockTokenProviderGraph();

    const provision = await plugin.localDebug(context);
    chai.assert.isTrue(provision.isOk());

    mockProvisionResult(context, true);
    const setAppId = plugin.setApplicationInContext(context, true);
    chai.assert.isTrue(setAppId.isOk());

    const postProvision = await plugin.postLocalDebug(context);
    chai.assert.isTrue(postProvision.isOk());
  });

  it("local debug: skip local debug", async function () {
    context = await TestHelper.pluginContext(new Map(), true, false, true);
    context.appStudioToken = mockTokenProvider();
    context.graphTokenProvider = mockTokenProviderGraph();
    mockSkipFlag(context, true);

    const localDebug = await plugin.localDebug(context);
    chai.assert.isTrue(localDebug.isOk());
  });

  it("check permission", async function () {
    const config = new Map();
    config.set(ConfigKeys.objectId, faker.datatype.uuid());
    context = await TestHelper.pluginContext(config, true, false, false);
    context.graphTokenProvider = mockTokenProviderGraph();

    const checkPermission = await plugin.checkPermission(context, userList);
    chai.assert.isTrue(checkPermission.isOk());
  });

  it("grant permission", async function () {
    const config = new Map();
    config.set(ConfigKeys.objectId, faker.datatype.uuid());
    context = await TestHelper.pluginContext(config, true, false, false);
    context.graphTokenProvider = mockTokenProviderGraph();

    const grantPermission = await plugin.grantPermission(context, userList);
    chai.assert.isTrue(grantPermission.isOk());
  });

  it("list collaborator", async function () {
    const config = new Map();
    config.set(ConfigKeys.objectId, faker.datatype.uuid());
    context = await TestHelper.pluginContext(config, true, false, false);
    context.graphTokenProvider = mockTokenProviderGraph();
    mockProvisionResult(context, false);

    const listCollaborator = await plugin.listCollaborator(context);
    chai.assert.isTrue(listCollaborator.isOk());
    if (listCollaborator.isOk()) {
      chai.assert.equal(listCollaborator.value[0].userObjectId, "id");
    }
  });
});

describe("AadAppForTeamsPlugin: Azure", () => {
  let plugin: AadAppForTeamsPlugin;
  let context: PluginContext;
  let appStudioToken: string | undefined;
  let graphToken: string | undefined;

  before(async function () {
    if (!testWithAzure) {
      this.skip();
    }

    appStudioToken = await getAppStudioToken();
    chai.assert.isString(appStudioToken);

    graphToken = await getGraphToken();
    chai.assert.isString(graphToken);
  });

  beforeEach(() => {
    plugin = new AadAppForTeamsPlugin();
  });

  afterEach(() => {
    sinon.restore();
  });

  it("provision: tab and bot with context changes", async function () {
    context = await TestHelper.pluginContext(new Map(), true, true, false);
    context.appStudioToken = mockTokenProviderAzure(appStudioToken as string);
    context.graphTokenProvider = mockTokenProviderAzureGraph(graphToken as string);

    const provision = await plugin.provision(context);
    chai.assert.isTrue(provision.isOk());

    const setAppId = plugin.setApplicationInContext(context);
    chai.assert.isTrue(setAppId.isOk());

    const postProvision = await plugin.postProvision(context);
    chai.assert.isTrue(postProvision.isOk());

    // Remove clientId and oauth2PermissionScopeId.
    context.config.set(ConfigKeys.clientId, "");
    context.config.set(ConfigKeys.oauth2PermissionScopeId, "");

    const provisionSecond = await plugin.provision(context);
    chai.assert.isTrue(provisionSecond.isOk());

    const setAppIdSecond = plugin.setApplicationInContext(context);
    chai.assert.isTrue(setAppIdSecond.isOk());

    const postProvisionSecond = await plugin.postProvision(context);
    chai.assert.isTrue(postProvisionSecond.isOk());

    // Remove objectId.
    // Create a new context with same context.config since error will occur with same endpoint and botId.
    context.config.set(ConfigKeys.objectId, "");
    context = await TestHelper.pluginContext(context.config, true, true);
    context.appStudioToken = mockTokenProviderAzure(appStudioToken as string);
    context.graphTokenProvider = mockTokenProviderAzureGraph(graphToken as string);

    const provisionThird = await plugin.provision(context);
    chai.assert.isTrue(provisionThird.isOk());

    const setAppIdThird = plugin.setApplicationInContext(context);
    chai.assert.isTrue(setAppIdThird.isOk());

    const postProvisionThird = await plugin.postProvision(context);
    chai.assert.isTrue(postProvisionThird.isOk());
  });
});
