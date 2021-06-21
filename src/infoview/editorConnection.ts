import { Location, ShowDocumentParams } from "vscode-languageserver-protocol";

import { Eventify } from "./event";
import { DocumentPosition } from "./util";
import { EditorApi, InfoviewApi } from "../infoviewApi";
import { PlainGoal, PlainTermGoal } from "../lspTypes";

export type EditorEvents = Eventify<InfoviewApi>;

export class EditorConnection {
  constructor(readonly api: EditorApi, readonly events: EditorEvents) {}

  /** Highlights the given range in a document in the editor. */
  revealLocation(loc: Location): void {
    const show: ShowDocumentParams = {
      uri: loc.uri,
      selection: loc.range,
    };
    this.api.showDocument(show);
  }

  revealPosition(pos: DocumentPosition) {
    const loc: Location = {
      uri: pos.uri,
      range: {
        start: pos,
        end: pos,
      },
    };
    this.revealLocation(loc);
  }

  /** Copies the text to a comment at the cursor position. */
  copyToComment(text: string): void {
    return; // TODO
    //const edit: TextDocumentEdit = {
    //
    //};
    // ec.api.applyEdits([edit]);
    // return serverApi.insertText(`/-\n${text}\n-/\n`, 'relative');
  }

  requestPlainGoal(pos: DocumentPosition): Promise<PlainGoal> {
    const params = DocumentPosition.toTdpp(pos);
    return this.api.sendClientRequest('$/lean/plainGoal', params);
  }

  requestPlainTermGoal(pos: DocumentPosition): Promise<PlainTermGoal> {
    const params = DocumentPosition.toTdpp(pos);
    return this.api.sendClientRequest('$/lean/plainTermGoal', params);
  }

}