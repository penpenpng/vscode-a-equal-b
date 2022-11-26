import {
  createConnection,
  TextDocuments,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  TextDocumentSyncKind,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { LANG_ID } from "./consts";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize((ev) => {
  const capabilities = ev.capabilities;

  hasDiagnosticRelatedInformationCapability = !!(
    capabilities.textDocument &&
    capabilities.textDocument.publishDiagnostics &&
    capabilities.textDocument.publishDiagnostics.relatedInformation
  );

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
    },
  };
});

documents.onDidChangeContent((ev) => {
  validateTextDocument(ev.document);
});

documents.onDidClose((ev) => {
  connection.sendDiagnostics({ uri: ev.document.uri, diagnostics: [] });
});

const getErrors = (line: string): string[] => {
  const indexOfAll = (str: string, char: string): number[] => {
    const res: number[] = [];
    for (let i = 0; i < str.length; i++) {
      if (str[i] === char) res.push(i);
    }
    return res;
  };

  const errors: string[] = [];
  // Ignore comment
  const inst = line.split("#")[0];
  // Ignore whitespaces
  const expr = inst.replace(/\s/g, "");

  if (expr === "") {
    // Blank line is valid
    return [];
  }
  if (!/^[ -~]*$/.test(expr)) {
    errors.push("Instruction cannot contain non-ascii characters.");
  }

  const hands = expr.split("=");

  if (hands.length !== 2) {
    return [...errors, "Each instruction must include exactly one equal sign."];
  }

  const parsed = hands.map((h) =>
    h
      .replace(/\(return\)/g, "#r")
      .replace(/\(start\)/g, "#s")
      .replace(/\(end\)/g, "#e")
      .replace(/\(once\)/g, "#o")
  );

  if (parsed.some((hand) => hand.includes("("))) {
    errors.push("( is invalid.");
  }
  if (parsed.some((hand) => hand.includes(")"))) {
    errors.push(") is invalid.");
  }
  if (parsed.some((hand) => indexOfAll(hand, "#").length > 1)) {
    errors.push("Each side cannot contain more than one keyword.");
  }
  if (parsed.some((hand) => indexOfAll(hand, "#").find((pos) => pos > 0))) {
    errors.push("Keywords must occur at the start of left side or right side.");
  }

  const [left, right] = parsed;

  if (left.startsWith("#r")) {
    errors.push("(return) is allowed only in right side.");
  }
  if (right.startsWith("#o")) {
    errors.push("(once) is allowed only in left side.");
  }
  if (left.startsWith("#o") && right.startsWith("#")) {
    errors.push("(once) and another keyword cannot be used at the same time.");
  }
  if (right.startsWith("#r") && left.startsWith("#")) {
    errors.push(
      "(return) and another keyword cannot be used at the same time."
    );
  }

  return errors;
};

const validateTextDocument = async (
  textDocument: TextDocument
): Promise<void> => {
  const { uri } = textDocument;
  const text = textDocument.getText();
  const diagnostics: Diagnostic[] = [];

  for (const [line, index] of iterateMatches(/.+/g, text)) {
    const range = {
      start: textDocument.positionAt(index),
      end: textDocument.positionAt(index + line.split("#")[0].trimEnd().length),
    };

    const errors = getErrors(line);

    if (errors.length > 0) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range,
        message: "Syntax Error",
        source: LANG_ID,
        relatedInformation: hasDiagnosticRelatedInformationCapability
          ? errors.map((message) => ({
              location: { uri, range },
              message,
            }))
          : undefined,
      });
    }
  }

  connection.sendDiagnostics({ uri, diagnostics });
};

function* iterateMatches(pattern: RegExp, str: string) {
  let m: RegExpExecArray | null = null;

  while ((m = pattern.exec(str))) {
    yield [m[0], m.index] as const;
  }
}

documents.listen(connection);
connection.listen();
