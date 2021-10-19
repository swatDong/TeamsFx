// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { Func, PluginContext, QTreeNode } from "@microsoft/teamsfx-api";
import { BuildError, NotImplemented } from "../error";
import { IApimPluginConfig } from "../config";
import * as VSCode from "../questions/vscodeQuestion";
import * as CLI from "../questions/cliQuestion";
import { isArmSupportEnabled } from "../../../..";

export interface IQuestionManager {
  callFunc(func: Func, ctx: PluginContext): Promise<any>;
  addResource(ctx: PluginContext, apimConfig?: IApimPluginConfig): Promise<QTreeNode>;
  deploy(ctx: PluginContext, apimConfig?: IApimPluginConfig): Promise<QTreeNode>;
}

export class VscQuestionManager implements IQuestionManager {
  private readonly apimServiceQuestion: VSCode.ApimServiceQuestion;
  private readonly openApiDocumentQuestion: VSCode.OpenApiDocumentQuestion;
  private readonly existingOpenApiDocumentFunc: VSCode.ExistingOpenApiDocumentFunc;
  private readonly apiPrefixQuestion: VSCode.ApiPrefixQuestion;
  private readonly apiVersionQuestion: VSCode.ApiVersionQuestion;
  private readonly newApiVersionQuestion: VSCode.NewApiVersionQuestion;

  constructor(
    apimServiceQuestion: VSCode.ApimServiceQuestion,
    openApiDocumentQuestion: VSCode.OpenApiDocumentQuestion,
    apiPrefixQuestion: VSCode.ApiPrefixQuestion,
    apiVersionQuestion: VSCode.ApiVersionQuestion,
    newApiVersionQuestion: VSCode.NewApiVersionQuestion,
    existingOpenApiDocumentFunc: VSCode.ExistingOpenApiDocumentFunc
  ) {
    this.apimServiceQuestion = apimServiceQuestion;
    this.openApiDocumentQuestion = openApiDocumentQuestion;
    this.apiPrefixQuestion = apiPrefixQuestion;
    this.apiVersionQuestion = apiVersionQuestion;
    this.newApiVersionQuestion = newApiVersionQuestion;
    this.existingOpenApiDocumentFunc = existingOpenApiDocumentFunc;
  }

  async callFunc(func: Func, ctx: PluginContext): Promise<any> {
    throw BuildError(NotImplemented);
  }

  async addResource(ctx: PluginContext, apimConfig: IApimPluginConfig): Promise<QTreeNode> {
    const rootNode = new QTreeNode({
      type: "group",
    });
    if (apimConfig.serviceName || isArmSupportEnabled()) {
      return rootNode;
    }

    const question = this.apimServiceQuestion.getQuestion();
    const apimServiceNode = new QTreeNode(question);
    rootNode.addChild(apimServiceNode);
    return rootNode;
  }

  async deploy(ctx: PluginContext, apimConfig: IApimPluginConfig): Promise<QTreeNode> {
    const rootNode = new QTreeNode({
      type: "group",
    });

    let documentNode: QTreeNode;
    if (!apimConfig.apiDocumentPath) {
      const documentPathQuestion = this.openApiDocumentQuestion.getQuestion(ctx);
      documentNode = new QTreeNode(documentPathQuestion);
    } else {
      const documentPathFunc = this.existingOpenApiDocumentFunc.getQuestion(ctx);
      documentNode = new QTreeNode(documentPathFunc);
    }

    rootNode.addChild(documentNode);

    if (!apimConfig.apiPrefix) {
      const apiPrefixQuestion = this.apiPrefixQuestion.getQuestion();
      const apiPrefixQuestionNode = new QTreeNode(apiPrefixQuestion);
      documentNode.addChild(apiPrefixQuestionNode);
    }

    const versionQuestion = this.apiVersionQuestion.getQuestion(ctx);
    const versionQuestionNode = new QTreeNode(versionQuestion);
    documentNode.addChild(versionQuestionNode);

    const newVersionQuestion = this.newApiVersionQuestion.getQuestion();
    const newVersionQuestionNode = new QTreeNode(newVersionQuestion);
    newVersionQuestionNode.condition = this.newApiVersionQuestion.condition();
    versionQuestionNode.addChild(newVersionQuestionNode);

    return rootNode;
  }
}

export class CliQuestionManager implements IQuestionManager {
  private readonly apimServiceNameQuestion: CLI.ApimServiceNameQuestion;
  private readonly apimResourceGroupQuestion: CLI.ApimResourceGroupQuestion;
  private readonly openApiDocumentQuestion: CLI.OpenApiDocumentQuestion;
  private readonly apiPrefixQuestion: CLI.ApiPrefixQuestion;
  private readonly apiVersionQuestion: CLI.ApiVersionQuestion;
  constructor(
    apimServiceNameQuestion: CLI.ApimServiceNameQuestion,
    apimResourceGroupQuestion: CLI.ApimResourceGroupQuestion,
    openApiDocumentQuestion: CLI.OpenApiDocumentQuestion,
    apiPrefixQuestion: CLI.ApiPrefixQuestion,
    apiVersionQuestion: CLI.ApiVersionQuestion
  ) {
    this.apimServiceNameQuestion = apimServiceNameQuestion;
    this.apimResourceGroupQuestion = apimResourceGroupQuestion;
    this.openApiDocumentQuestion = openApiDocumentQuestion;
    this.apiPrefixQuestion = apiPrefixQuestion;
    this.apiVersionQuestion = apiVersionQuestion;
  }

  async callFunc(func: Func, ctx: PluginContext): Promise<any> {
    throw BuildError(NotImplemented);
  }

  async addResource(ctx: PluginContext): Promise<QTreeNode> {
    const rootNode = new QTreeNode({
      type: "group",
    });

    const apimResourceGroupQuestion = this.apimResourceGroupQuestion.getQuestion();
    rootNode.addChild(new QTreeNode(apimResourceGroupQuestion));
    const apimServiceNameQuestion = this.apimServiceNameQuestion.getQuestion();
    rootNode.addChild(new QTreeNode(apimServiceNameQuestion));
    return rootNode;
  }

  async deploy(): Promise<QTreeNode> {
    const rootNode = new QTreeNode({
      type: "group",
    });

    const openApiDocumentQuestion = this.openApiDocumentQuestion.getQuestion();
    rootNode.addChild(new QTreeNode(openApiDocumentQuestion));
    const apiPrefixQuestion = this.apiPrefixQuestion.getQuestion();
    rootNode.addChild(new QTreeNode(apiPrefixQuestion));
    const apiVersionQuestion = this.apiVersionQuestion.getQuestion();
    rootNode.addChild(new QTreeNode(apiVersionQuestion));
    return rootNode;
  }
}
