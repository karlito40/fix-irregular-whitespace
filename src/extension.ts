import * as vscode from 'vscode';
import * as fs from 'fs';
import { promisify } from 'util';
import globby from 'globby';
import { getIrregularWhiteSpacesRegex } from './irregularWhitespaces';

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);

const irregularWhitespacesMatchRegex = getIrregularWhiteSpacesRegex();

export function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "fix-irregular-whitespace" is now active!');

  vscode.workspace.onWillSaveTextDocument(changeEvent => {
    fixIrregularWhitespace(changeEvent.document);
   });

  let forFile = vscode.commands.registerCommand('extension.fixIrregularWhitespaceInFile', async () => {
    let editor = vscode.window.activeTextEditor;
    if(!editor) {
      return vscode.window.showErrorMessage('No active editor found');
    }

    await fixIrregularWhitespace(editor.document);
    vscode.window.showInformationMessage('Irregular whitespace fixed' );
  });

  let forWorkspace = vscode.commands.registerCommand('extension.fixIrregularWhitespaceInWorkspace', async () => {
    let editor = vscode.window.activeTextEditor;
    if(!editor) {
      return vscode.window.showErrorMessage('No active editor found');
    }

    let workspaceFolders = vscode.workspace.workspaceFolders || [];
    let currentDoc = editor.document;
    const workspaceFolder = workspaceFolders.find(ws => {
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
      .map(path => workspaceFolder.uri.fsPath + '/'+ path)
      .map(fsPath =>  {
        if (openDocs[fsPath]) {
          return fixIrregularWhitespace(openDocs[fsPath]);
        }

        return readFile(fsPath, 'utf-8').then(content => {
          let newText = removeIrregular(content);
          if (newText) {
            return writeFile(fsPath, newText as string);
          }
        });
      });

    Promise.all(promises).then(() => {
      vscode.window.showInformationMessage('Irregular whitespace fixed' );
    });
  });

  context.subscriptions.push(forFile);
  context.subscriptions.push(forWorkspace);
}

export function deactivate() {}

async function fixIrregularWhitespace (document: vscode.TextDocument) {
  let newText = removeIrregular(document.getText());
  if(!newText) {
    return;
  }  

  let editor = vscode.window.visibleTextEditors.find(editor => editor.document === document);
  if (editor) {
    // https://stackoverflow.com/questions/45203543/vs-code-extension-api-to-get-the-range-of-the-whole-text-of-a-document
    let invalidRange = new vscode.Range(0, 0, document.lineCount, 0);
    let fullRange = document.validateRange(invalidRange);
    return editor.edit(editBuilder => editBuilder.replace(fullRange, <string> newText));
  }

  return writeFile(document.uri.fsPath, newText as string);
}

function removeIrregular (text: string): string | boolean {
  if(!irregularWhitespacesMatchRegex.test(text)) {
    return false;
  }

  return text.replace(irregularWhitespacesMatchRegex, ' '); // irregular whitespace
}
