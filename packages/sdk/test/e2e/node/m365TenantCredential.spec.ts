// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { assert, expect, use as chaiUse } from "chai";
import chaiPromises from "chai-as-promised";
import mockedEnv from "mocked-env";
import { loadConfiguration, M365TenantCredential } from "../../../src";
import { ErrorCode, ErrorWithCode } from "../../../src/core/errors";
import jwtDecode from "jwt-decode";
import {
  MockEnvironmentVariable,
  RestoreEnvironmentVariable,
  AADJwtPayLoad,
  convertCertificateContent,
} from "../helper";

chaiUse(chaiPromises);
let restore: () => void;
describe("M365TenantCredential Tests - Node", () => {
  const fake_client_secret = "fake_client_secret";
  const defaultGraphScope = ["https://graph.microsoft.com/.default"];

  beforeEach(function () {
    restore = MockEnvironmentVariable();
    loadConfiguration();
  });

  afterEach(() => {
    RestoreEnvironmentVariable(restore);
  });

  it("create M365TenantCredential instance should success with valid configuration", function () {
    const credential: any = new M365TenantCredential();

    assert.strictEqual(credential.msalClient.config.auth.clientId, process.env.M365_CLIENT_ID);
    assert.strictEqual(
      credential.msalClient.config.auth.authority,
      process.env.M365_AUTHORITY_HOST + "/" + process.env.M365_TENANT_ID
    );
    assert.strictEqual(
      credential.msalClient.config.auth.clientSecret,
      process.env.M365_CLIENT_SECRET
    );
  });

  it("getToken should success with .default scope when authority host has tailing slash", async function () {
    restore = mockedEnv({
      M365_AUTHORITY_HOST: process.env.SDK_INTEGRATION_TEST_AAD_AUTHORITY_HOST + "/",
    });
    loadConfiguration();

    const credential = new M365TenantCredential();
    const token = await credential.getToken(defaultGraphScope);

    const decodedToken = jwtDecode<AADJwtPayLoad>(token!.token);
    assert.strictEqual(decodedToken.aud, "https://graph.microsoft.com");
    assert.strictEqual(decodedToken.appid, process.env.M365_CLIENT_ID);
    assert.strictEqual(decodedToken.idtyp, "app");
  });

  it("getToken should success with .default scope for Client Secret", async function () {
    const credential = new M365TenantCredential();
    const token = await credential.getToken(defaultGraphScope);

    const decodedToken = jwtDecode<AADJwtPayLoad>(token!.token);
    assert.strictEqual(decodedToken.aud, "https://graph.microsoft.com");
    assert.strictEqual(decodedToken.appid, process.env.M365_CLIENT_ID);
    assert.strictEqual(decodedToken.idtyp, "app");
  });

  it("getToken should success with .default scope for Client Certificate", async function () {
    loadConfiguration({
      authentication: {
        clientId: process.env.SDK_INTEGRATION_TEST_M365_AAD_CLIENT_ID,
        certificateContent: convertCertificateContent(
          process.env.SDK_INTEGRATION_TEST_M365_AAD_CERTIFICATE_CONTENT
        ),
        authorityHost: process.env.SDK_INTEGRATION_TEST_AAD_AUTHORITY_HOST,
        tenantId: process.env.SDK_INTEGRATION_TEST_AAD_TENANT_ID,
      },
    });

    const credential = new M365TenantCredential();
    const token = await credential.getToken(defaultGraphScope);

    const decodedToken = jwtDecode<AADJwtPayLoad>(token!.token);
    assert.strictEqual(decodedToken.aud, "https://graph.microsoft.com");
    assert.strictEqual(decodedToken.appid, process.env.M365_CLIENT_ID);
    assert.strictEqual(decodedToken.idtyp, "app");
  });

  it("getToken should throw ServiceError with invalid secret", async function () {
    restore = mockedEnv({
      M365_CLIENT_SECRET: fake_client_secret,
    });
    loadConfiguration();
    const credential = new M365TenantCredential();

    const errorResult = await expect(
      credential.getToken(defaultGraphScope)
    ).to.eventually.be.rejectedWith(ErrorWithCode);
    assert.strictEqual(errorResult.code, ErrorCode.ServiceError);
    assert.include(
      errorResult.message,
      "Get M365 tenant credential failed with error: invalid_client: 7000215"
    );
  });
});
