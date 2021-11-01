import * as React from "react";
import { Icon, Stack, Image, PrimaryButton } from "@fluentui/react";
import "./SampleGallery.scss";
import { Commands } from "./Commands";
import FAQPlus from "../../media/faq-plus.gif";
import InMeetingApp from "../../media/in-meeting-app.png";
import ShareNow from "../../media/share-now.gif";
import ToDoList from "../../media/to-do-list.gif";
import ToDoListSharepoint from "../../media/to-do-list-sharepoint.gif";

export default class SampleGallery extends React.Component<any, any> {
  constructor(props: any) {
    super(props);
  }

  componentDidMount() {
    window.addEventListener("message", this.receiveMessage, false);
  }

  render() {
    return (
      <div className="sample-gallery">
        <div className="section" id="title">
          <div className="logo">
            <Icon iconName="Heart" className="logo" />
          </div>
          <div className="title">
            <h2>Samples</h2>
            <h3>Explore our sample apps to quickly get started with concepts and code examples.</h3>
          </div>
        </div>
        <Stack
          className="sample-stack"
          horizontal
          verticalFill
          wrap
          horizontalAlign={"start"}
          verticalAlign={"start"}
          styles={{ root: { overflow: "visible" } }}
          tokens={{ childrenGap: 20 }}
        >
          <SampleAppCard
            image={ToDoList}
            tags={["React", "Azure function", "Azure SQL", "JS", "CI/CD"]}
            title="Todo List with Azure backend"
            description="Todo List provides an easy way to manage to-do items in Teams Client. This app helps enabling task collaboration and management for your team. The frontend is a React app and the backend is hosted on Azure. You will need an Azure subscription to run the app."
            sampleAppFolder="todo-list-with-Azure-backend"
            sampleAppUrl="https://github.com/OfficeDev/TeamsFx-Samples/archive/refs/heads/main.zip"
          />
          <SampleAppCard
            image={ToDoListSharepoint}
            tags={["SharePoint", "SPFx", "TS"]}
            title="Todo List with SPFx "
            description="Todo List with SPFx is a Todo List for individuals to manage his/her personal to-do items. This app is hosted on Sharepoint. There is no requirements to deploy Azure resources."
            sampleAppFolder="todo-list-SPFx"
            sampleAppUrl="https://github.com/OfficeDev/TeamsFx-Samples/archive/refs/heads/main.zip"
          />
          <SampleAppCard
            image={ShareNow}
            tags={["Tab", "Message Extension", "TS"]}
            title="Share Now"
            description="Share Now promotes the exchange of information between colleagues by enabling users to share content within the Teams environment. Users engage the app to share items of interest, discover new shared content, set preferences, and bookmark favorites for later reading."
            sampleAppFolder="share-now"
            sampleAppUrl="https://github.com/OfficeDev/TeamsFx-Samples/archive/refs/heads/main.zip"
          />
          <SampleAppCard
            image={InMeetingApp}
            tags={["Meeting extension", "JS"]}
            title="In-meeting App"
            description="In-meeting app is a hello-world template which shows how to build an app in the context of a Teams meeting. This is a hello-world sample which does not provide any functional feature. This app contains a side panel and a Bot which only shows user profile and can only be added to a Teams meeting."
            sampleAppFolder="in-meeting-app"
            sampleAppUrl="https://github.com/OfficeDev/TeamsFx-Samples/archive/refs/heads/main.zip"
          />
          <SampleAppCard
            image={FAQPlus}
            tags={["Easy QnA", "Bot", "JS"]}
            title="FAQ Plus"
            description="FAQ Plus is a conversational Q&A bot providing an easy way to answer frequently asked questions by users. One can ask a question and the bot responds with information in the knowledge base. If the answer is not in the knowledge base, the bot submits the question to a pre-configured team of experts who help provide support."
            sampleAppFolder="faq-plus"
            sampleAppUrl="https://github.com/OfficeDev/TeamsFx-Samples/archive/refs/heads/main.zip"
          />
        </Stack>
      </div>
    );
  }

  receiveMessage = (event: any) => {
    const message = event.data.message;

    switch (message) {
      default:
        break;
    }
  };
}

class SampleAppCard extends React.Component<any, any> {
  constructor(props: any) {
    super(props);
  }

  render() {
    return (
      <div className="sample-app-card" tabIndex={0}>
        <label
          style={{
            position: "absolute",
            top: "auto",
            left: -9999,
            width: 1,
            height: 1,
            overflow: "hidden",
          }}
        >
          sample app card
        </label>
        <Image src={this.props.image} width={278} height={160} />
        <label
          style={{
            position: "absolute",
            top: "auto",
            left: -9999,
            width: 1,
            height: 1,
            overflow: "hidden",
          }}
          id="tagLabel"
        >
          sample app tags:
        </label>
        <div className="section" aria-labelledby="tagLabel">
          {this.props.tags &&
            this.props.tags.map((value: string) => {
              return <p className="tag">{value}</p>;
            })}
        </div>
        <label
          style={{
            position: "absolute",
            top: "auto",
            left: -9999,
            width: 1,
            height: 1,
            overflow: "hidden",
          }}
          id="titleLabel"
        >
          sample app title:
        </label>
        <h2>{this.props.title}</h2>
        <label
          style={{
            position: "absolute",
            top: "auto",
            left: -9999,
            width: 1,
            height: 1,
            overflow: "hidden",
          }}
          id="descriptionLabel"
        >
          sample app description:
        </label>
        <h3>{this.props.description}</h3>
        <div className="section buttons">
          <PrimaryButton
            text="Repository"
            className="right-aligned"
            onClick={() => {
              this.viewSampleApp(this.props.sampleAppFolder);
            }}
          />
          <PrimaryButton
            text="Download"
            className="right-aligned"
            onClick={() => {
              this.cloneSampleApp(
                this.props.title,
                this.props.sampleAppUrl,
                this.props.sampleAppFolder
              );
            }}
          />
        </div>
      </div>
    );
  }

  cloneSampleApp = (sampleAppName: string, sampleAppUrl: string, sampleAppFolder: string) => {
    vscode.postMessage({
      command: Commands.CloneSampleApp,
      data: {
        appName: sampleAppName,
        appUrl: sampleAppUrl,
        appFolder: sampleAppFolder,
      },
    });
  };

  viewSampleApp = (sampleAppFolder: string) => {
    const sampleBaseUrl = "https://github.com/OfficeDev/TeamsFx-Samples/tree/main/";
    vscode.postMessage({
      command: Commands.OpenExternalLink,
      data: sampleBaseUrl + sampleAppFolder,
    });
  };
}
