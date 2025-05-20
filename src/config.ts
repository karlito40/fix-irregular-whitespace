import * as vscode from 'vscode';

export const shouldApplyOnSave = () => vscode.workspace.getConfiguration().get('fixIrregularWhitespace.shouldApplyOnSave')