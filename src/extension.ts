import * as vscode from 'vscode';
import * as fs from 'fs';
import { promisify } from 'util';
import globby from 'globby';
import { getIrregularWhiteSpacesRegex } from './irregularWhitespaces';
import { shouldApplyOnSave } from './config';

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);

const irregularWhitespacesMatchRegex = getIrregularWhiteSpacesRegex();

export function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "fix-irregular-whitespace" is now active!');

  const forAutoSave = vscode.workspace.onWillSaveTextDocument(async (changeEvent) => {
    if (!shouldApplyOnSave()) {
      return;
    }

    const { irregularMatchCount } = await fixIrregularWhitespace(changeEvent.document).then(res => res || { irregularMatchCount: 0 });
    irregularMatchCount && showIrregularFixMessage(irregularMatchCount);
   });

  let forFile = vscode.commands.registerCommand('extension.fixIrregularWhitespaceInFile', async () => {
    let editor = vscode.window.activeTextEditor;
    if(!editor) {
      return vscode.window.showErrorMessage('No active editor found');
    }
    
    const { irregularMatchCount } = await fixIrregularWhitespace(editor.document).then(res => res || { irregularMatchCount: 0 });
    if (irregularMatchCount) {
      showIrregularFixMessage(irregularMatchCount)
    } else {
      vscode.window.showInformationMessage('No irregular whitespace characters found' );
    }
  });

  let forWorkspace = vscode.commands.registerCommand('extension.fixIrregularWhitespaceInWorkspace', async () => {
    let editor = vscode.window.activeTextEditor;
    if(!editor) {
      return vscode.window.showErrorMessage('No active editor found');
    }

    let workspaceFolders = vscode.workspace.workspaceFolders || [];
    let currentDoc = editor.document;
    const workspaceFolder = workspaceFolders.find((ws) => {
      return currentDoc.uri.fsPath.includes(ws.uri.fsPath);
    });
    if(!workspaceFolder) {
      return vscode.window.showErrorMessage('No active workspace folder found');
    }

    type DocMap = Record<string, vscode.TextDocument>;
    const openDocs = vscode.workspace.textDocuments.reduce<DocMap>((acc, openDoc) => {
      acc[openDoc.uri.fsPath] = openDoc;
      return acc;
    }, {});

    const paths = await globby('**', {
      cwd: workspaceFolder.uri.fsPath,
      gitignore: true
    });
    
    const promises = paths
      .map((path: string) => workspaceFolder.uri.fsPath + '/'+ path)
      .map((fsPath: string) =>  {
        if (openDocs[fsPath]) {
          // TODO: Does not works if the document is in "background" mode
          // - The document will have no editor
          return fixIrregularWhitespace(openDocs[fsPath])
            .then((res) => (res && res.irregularMatchCount) || 0);
        }


        return readFile(fsPath, 'utf-8').then((content: string) => {
          const { newText, irregularMatchCount } = removeIrregular(content) || { newText: null, irregularMatchCount: 0};
          return newText 
            ? writeFile(fsPath, newText).then(() => irregularMatchCount || 0)
            : 0
        });
      });

    const irregularMatchCounts: number[] = await Promise.all(promises)
    const irregularMatchCount = irregularMatchCounts.reduce((acc, currentValue) => acc + currentValue, 0)
    irregularMatchCount && showIrregularFixMessage(irregularMatchCount)
  });

  context.subscriptions.push(...[
    forFile, 
    forWorkspace,
    forAutoSave
  ]);
}

export function deactivate() {}

async function fixIrregularWhitespace (document: vscode.TextDocument): Promise<{ irregularMatchCount: number } | undefined>  {
  const { newText, irregularMatchCount } = removeIrregular(document.getText()) || {newText: null, irregularMatchCount: 0};
  if(!newText) {
    return undefined;
  }  

  const editor = vscode.window.visibleTextEditors.find((editor) => editor.document === document);
  if (editor) {
    // https://stackoverflow.com/questions/45203543/vs-code-extension-api-to-get-the-range-of-the-whole-text-of-a-document
    const invalidRange = new vscode.Range(0, 0, document.lineCount, 0);
    const fullRange = document.validateRange(invalidRange);
    await editor.edit((editBuilder) => editBuilder.replace(fullRange, newText));
    return {
      irregularMatchCount: irregularMatchCount || 0
    }
  }

  await writeFile(document.uri.fsPath, newText);
  return {
    irregularMatchCount: irregularMatchCount || 0
  }
}

function removeIrregular (text: string): { newText: string; irregularMatchCount: number } | undefined {
  if(!irregularWhitespacesMatchRegex.test(text)) {
    return undefined;
  }

  const irregularMatchCount = (text.match(irregularWhitespacesMatchRegex) || []).length;

  return {
    newText: text.replace(irregularWhitespacesMatchRegex, ' '), // irregular whitespace
    irregularMatchCount
  }
}

function showIrregularFixMessage(irregularMatchCount: number) {
  vscode.window.showInformationMessage(`${irregularMatchCount} irregular whitespace characters replaced`);
}

