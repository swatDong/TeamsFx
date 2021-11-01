// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import "mocha";
import sinon from "sinon";
import * as chai from "chai";
import * as path from "path";
import { SpfxPlugin } from "../../../../../src/plugins/resource/spfx";
import { SPFxPluginImpl } from "../../../../../src/plugins/resource/spfx/plugin";
import { ok, PluginContext } from "@microsoft/teamsfx-api";
import { TestHelper, MockUserInteraction } from "../helper";
import { SPOClient } from "../../../../../src/plugins/resource/spfx/spoClient";

describe("SPFxDeploy", function () {
  let plugin: SpfxPlugin;
  let pluginContext: PluginContext;
  const sandbox = sinon.createSandbox();

  beforeEach(async () => {
    plugin = new SpfxPlugin();
    pluginContext = TestHelper.getFakePluginContext(
      "spfxdeploy1019",
      path.resolve("./tests/plugins/resource/spfx/resources/"),
      "none"
    );
    sandbox.stub(SPFxPluginImpl.prototype, "buildSPPackage" as any).returns(ok(undefined));
    sandbox.stub(SPFxPluginImpl.prototype, "getTenant" as any).returns(ok("TENANT_URL"));
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("deploy successfully", async function () {
    sandbox.stub(SPOClient, "getAppCatalogSite").resolves("APP_CATALOG");
    sandbox.stub(SPOClient, "uploadAppPackage").resolves();
    sandbox.stub(SPOClient, "deployAppPackage").resolves();
    const result = await plugin.deploy(pluginContext);
    chai.assert.isTrue(result.isOk());
  });

  it("deploy failed with insufficient permission", async function () {
    sandbox.stub(SPOClient, "getAppCatalogSite").resolves("APP_CATALOG");
    const error = {
      response: {
        status: 403,
      },
    };
    sandbox.stub(SPOClient, "uploadAppPackage").throws(error);
    const result = await plugin.deploy(pluginContext);
    chai.assert.isTrue(result.isErr());
  });

  it("create app catalog failed", async function () {
    sandbox.stub(SPOClient, "getAppCatalogSite").resolves(undefined);
    sandbox.stub(SPOClient, "createAppCatalog").resolves();
    pluginContext.ui = new MockUserInteraction();
    const result = await plugin.deploy(pluginContext);
    chai.assert.isTrue(result.isErr());
  });
});
