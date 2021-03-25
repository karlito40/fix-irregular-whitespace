import * as vscode from 'vscode';
import * as fs from 'fs';
import { promisify } from 'util';
import globby from 'globby';

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);

/*
* Picked from no-irregular-whitespace rule implementation 
* https://eslint.org/docs/rules/no-irregular-whitespace
*/
const irregularWhitespaces = [
  '\u000B', // Line Tabulation (\v) - <VT>
  '\u000C', // Form Feed (\f) - <FF>
  '\u00A0', // No-Break Space - <NBSP>
  '\u0085', // Next Line
  '\u1680', // Ogham Space Mark
  '\u180E', // Mongolian Vowel Separator - <MVS>
  '\ufeff', // Zero Width No-Break Space - <BOM>
  '\u2000', // En Quad
  '\u2001', // Em Quad
  '\u2002', // En Space - <ENSP>
  '\u2003', // Em Space - <EMSP>
  '\u2004', // Tree-Per-Em
  '\u2005', // Four-Per-Em
  '\u2006', // Six-Per-Em
  '\u2007', // Figure Space
  '\u2008', // Punctuation Space - <PUNCSP>
  '\u2009', // Thin Space
  '\u200A', // Hair Space
  '\u200B', // Zero Width Space - <ZWSP>
  '\u2028', // Line Separator
  '\u2029', // Paragraph Separator
  '\u202F', // Narrow No-Break Space
  '\u205f', // Medium Mathematical Space
  '\u3000' // Ideographic Space
];

const irregularWhitespacesMatchRegex = new RegExp(
    `[${irregularWhitespaces.join('')}]`,
    'g'
);

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

    let workspaceFolders = vscode.workspace.workspaceFolders || [];
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
