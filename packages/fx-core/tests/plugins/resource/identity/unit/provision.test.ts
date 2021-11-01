import "mocha";
import * as chai from "chai";
import { TestHelper } from "../helper";
import { IdentityPlugin } from "../../../../../src/plugins/resource/identity";
import * as dotenv from "dotenv";
import chaiAsPromised from "chai-as-promised";
import { PluginContext } from "@microsoft/teamsfx-api";
import * as msRestNodeAuth from "@azure/ms-rest-nodeauth";
import * as faker from "faker";
import * as sinon from "sinon";
import { Constants } from "../../../../../src/plugins/resource/identity/constants";
import { isArmSupportEnabled } from "../../../../../src";

chai.use(chaiAsPromised);

dotenv.config();

describe("identityPlugin", () => {
  if (isArmSupportEnabled()) {
    // plugin provision is skipped when using ARM
    return;
  }
  let identityPlugin: IdentityPlugin;
  let pluginContext: PluginContext;
  let credentials: msRestNodeAuth.TokenCredentialsBase;

  before(async () => {
    credentials = new msRestNodeAuth.ApplicationTokenCredentials(
      faker.datatype.uuid(),
      faker.internet.url(),
      faker.internet.password()
    );
  });

  beforeEach(async () => {
    identityPlugin = new IdentityPlugin();
    pluginContext = await TestHelper.pluginContext(credentials);
  });

  afterEach(() => {
    sinon.restore();
  });

  it("provision", async function () {
    // Arrange
    sinon.stub(IdentityPlugin.prototype, "provisionWithArmTemplate").resolves();

    // Act
    const provisionResult = await identityPlugin.provision(pluginContext);

    // Assert
    chai.assert.isTrue(provisionResult.isOk());
    chai.assert.strictEqual(
      pluginContext.config.get(Constants.identityName),
      identityPlugin.config.identityName
    );
  });
});
