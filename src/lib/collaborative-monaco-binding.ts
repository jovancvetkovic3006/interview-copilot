/**
 * Yjs ↔ Monaco sync (adapted from y-monaco).
 *
 * Fixes garbled / merged text when:
 * - The text model uses CRLF while Y.Text uses LF (offset math diverges).
 * - Monaco emits content changes after a Yjs-driven update; the stock mutex can miss those,
 *   so we ignore Y.Text events whose transaction originated from this binding (`origin === this`).
 *
 * MIT — see https://github.com/yjs/y-monaco
 */
import * as Y from "yjs";
import * as monaco from "monaco-editor";
import * as error from "lib0/error";
import { createMutex } from "lib0/mutex";
import type { Awareness } from "y-protocols/awareness";
import type { editor } from "monaco-editor";

class RelativeSelection {
  constructor(
    public start: Y.RelativePosition,
    public end: Y.RelativePosition,
    public direction: monaco.SelectionDirection
  ) {}
}

function createRelativeSelection(
  ed: editor.IStandaloneCodeEditor,
  monacoModel: editor.ITextModel,
  type: Y.Text
): RelativeSelection | null {
  const sel = ed.getSelection();
  if (sel !== null) {
    const startPos = sel.getStartPosition();
    const endPos = sel.getEndPosition();
    const start = Y.createRelativePositionFromTypeIndex(type, monacoModel.getOffsetAt(startPos));
    const end = Y.createRelativePositionFromTypeIndex(type, monacoModel.getOffsetAt(endPos));
    return new RelativeSelection(start, end, sel.getDirection());
  }
  return null;
}

function createMonacoSelectionFromRelativeSelection(
  ed: editor.IEditor,
  type: Y.Text,
  relSel: RelativeSelection,
  doc: Y.Doc
): monaco.Selection | null {
  const start = Y.createAbsolutePositionFromRelativePosition(relSel.start, doc);
  const end = Y.createAbsolutePositionFromRelativePosition(relSel.end, doc);
  if (start !== null && end !== null && start.type === type && end.type === type) {
    const model = ed.getModel() as editor.ITextModel | null;
    if (!model) return null;
    const startPos = model.getPositionAt(start.index);
    const endPos = model.getPositionAt(end.index);
    return monaco.Selection.createWithDirection(
      startPos.lineNumber,
      startPos.column,
      endPos.lineNumber,
      endPos.column,
      relSel.direction
    );
  }
  return null;
}

export class CollaborativeMonacoBinding {
  doc: Y.Doc;
  mux: ReturnType<typeof createMutex>;
  private readonly _savedSelections = new Map<editor.IStandaloneCodeEditor, RelativeSelection>();
  private readonly _beforeTransaction: () => void;
  private readonly _decorations = new Map<editor.IStandaloneCodeEditor, string[]>();
  private readonly _rerenderDecorations: () => void;
  private readonly _ytextObserver: (event: Y.YTextEvent) => void;
  private readonly _monacoChangeHandler: { dispose(): void };
  private readonly _monacoDisposeHandler: { dispose(): void };
  awareness: Awareness | undefined;

  constructor(
    public ytext: Y.Text,
    public monacoModel: editor.ITextModel,
    public editors: Set<editor.IStandaloneCodeEditor> = new Set(),
    awareness: Awareness | null = null
  ) {
    this.doc = ytext.doc as Y.Doc;
    this.mux = createMutex();

    this._beforeTransaction = () => {
      this.mux(() => {
        this._savedSelections.clear();
        editors.forEach((ed) => {
          if (ed.getModel() === monacoModel) {
            const rsel = createRelativeSelection(ed, monacoModel, ytext);
            if (rsel !== null) {
              this._savedSelections.set(ed, rsel);
            }
          }
        });
      });
    };
    this.doc.on("beforeAllTransactions", this._beforeTransaction);

    this._rerenderDecorations = () => {
      editors.forEach((ed) => {
        if (awareness && ed.getModel() === monacoModel) {
          const currentDecorations = this._decorations.get(ed) ?? [];
          const newDecorations: monaco.editor.IModelDeltaDecoration[] = [];
          awareness.getStates().forEach((state, clientID) => {
            if (
              clientID !== this.doc.clientID &&
              state.selection != null &&
              state.selection.anchor != null &&
              state.selection.head != null
            ) {
              const anchorAbs = Y.createAbsolutePositionFromRelativePosition(state.selection.anchor, this.doc);
              const headAbs = Y.createAbsolutePositionFromRelativePosition(state.selection.head, this.doc);
              if (
                anchorAbs !== null &&
                headAbs !== null &&
                anchorAbs.type === ytext &&
                headAbs.type === ytext
              ) {
                let start: monaco.Position;
                let end: monaco.Position;
                let afterContentClassName: string | null;
                let beforeContentClassName: string | null;
                if (anchorAbs.index < headAbs.index) {
                  start = monacoModel.getPositionAt(anchorAbs.index);
                  end = monacoModel.getPositionAt(headAbs.index);
                  afterContentClassName = "yRemoteSelectionHead yRemoteSelectionHead-" + clientID;
                  beforeContentClassName = null;
                } else {
                  start = monacoModel.getPositionAt(headAbs.index);
                  end = monacoModel.getPositionAt(anchorAbs.index);
                  afterContentClassName = null;
                  beforeContentClassName = "yRemoteSelectionHead yRemoteSelectionHead-" + clientID;
                }
                newDecorations.push({
                  range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
                  options: {
                    className: "yRemoteSelection yRemoteSelection-" + clientID,
                    afterContentClassName: afterContentClassName ?? undefined,
                    beforeContentClassName: beforeContentClassName ?? undefined,
                  },
                });
              }
            }
          });
          this._decorations.set(ed, ed.deltaDecorations(currentDecorations, newDecorations));
        } else {
          this._decorations.delete(ed);
        }
      });
    };

    this._ytextObserver = (event: Y.YTextEvent) => {
      if (event.transaction.origin === this) {
        this._rerenderDecorations();
        return;
      }
      this.mux(() => {
        let index = 0;
        event.delta.forEach((op) => {
          if (op.retain !== undefined) {
            index += op.retain;
          } else if (op.insert !== undefined) {
            const pos = monacoModel.getPositionAt(index);
            const range = new monaco.Selection(pos.lineNumber, pos.column, pos.lineNumber, pos.column);
            const insert = op.insert as string;
            monacoModel.applyEdits([{ range, text: insert }]);
            index += insert.length;
          } else if (op.delete !== undefined) {
            const pos = monacoModel.getPositionAt(index);
            const endPos = monacoModel.getPositionAt(index + op.delete);
            const range = new monaco.Selection(pos.lineNumber, pos.column, endPos.lineNumber, endPos.column);
            monacoModel.applyEdits([{ range, text: "" }]);
          } else {
            throw error.unexpectedCase();
          }
        });
        this._savedSelections.forEach((rsel, ed) => {
          const sel = createMonacoSelectionFromRelativeSelection(ed, ytext, rsel, this.doc);
          if (sel !== null) {
            ed.setSelection(sel);
          }
        });
      });
      this._rerenderDecorations();
    };
    ytext.observe(this._ytextObserver);
    {
      const ytextValue = ytext.toString();
      if (monacoModel.getValue() !== ytextValue) {
        monacoModel.setValue(ytextValue);
      }
    }
    this._monacoChangeHandler = monacoModel.onDidChangeContent((event) => {
      this.mux(() => {
        this.doc.transact(() => {
          event.changes
            .sort((change1, change2) => change2.rangeOffset - change1.rangeOffset)
            .forEach((change) => {
              ytext.delete(change.rangeOffset, change.rangeLength);
              ytext.insert(change.rangeOffset, change.text);
            });
        }, this);
      });
    });
    this._monacoDisposeHandler = monacoModel.onWillDispose(() => {
      this.destroy();
    });
    if (awareness) {
      editors.forEach((ed) => {
        ed.onDidChangeCursorSelection(() => {
          if (ed.getModel() === monacoModel) {
            const sel = ed.getSelection();
            if (sel === null) {
              return;
            }
            let anchor = monacoModel.getOffsetAt(sel.getStartPosition());
            let head = monacoModel.getOffsetAt(sel.getEndPosition());
            if (sel.getDirection() === monaco.SelectionDirection.RTL) {
              const tmp = anchor;
              anchor = head;
              head = tmp;
            }
            awareness.setLocalStateField("selection", {
              anchor: Y.createRelativePositionFromTypeIndex(ytext, anchor),
              head: Y.createRelativePositionFromTypeIndex(ytext, head),
            });
          }
        });
        awareness.on("change", this._rerenderDecorations);
      });
      this.awareness = awareness;
    }
  }

  destroy() {
    this._monacoChangeHandler.dispose();
    this._monacoDisposeHandler.dispose();
    this.ytext.unobserve(this._ytextObserver);
    this.doc.off("beforeAllTransactions", this._beforeTransaction);
    if (this.awareness) {
      this.awareness.off("change", this._rerenderDecorations);
    }
  }
}
