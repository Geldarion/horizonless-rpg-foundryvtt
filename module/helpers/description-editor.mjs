export function getDescriptionEditorActions(sheetClass) {
  return {
    editDescription: sheetClass._onEditDescription,
  };
}

export function populateDescriptionEditorContext(context, document, targetPath) {
  if (!targetPath) return;

  context.editingDescription = {
    target: targetPath,
    value: foundry.utils.getProperty(document._source, targetPath) ?? '',
  };
}

export function activateDescriptionEditor(sheet) {
  if (!sheet.editingDescriptionTarget) return;

  sheet.element.querySelectorAll('prose-mirror').forEach((editor) =>
    editor.addEventListener('save', sheet._onDescriptionEditorSave.bind(sheet))
  );
}

export function startDescriptionEditing(sheet, target) {
  if (target.ariaDisabled) return;
  sheet.editingDescriptionTarget = target.dataset.target;
  sheet.render();
}

export async function saveDescriptionEditorContent(sheet, event) {
  const targetPath = String(
    event.currentTarget?.getAttribute?.('name')
    ?? sheet.editingDescriptionTarget
    ?? ''
  ).trim();
  if (sheet._isSavingDescription) return;
  if (!targetPath) return;

  sheet._isSavingDescription = true;
  try {
    const editorValue = String(event.currentTarget?.value ?? '');
    await sheet.document.update({ [targetPath]: editorValue });
    sheet.editingDescriptionTarget = null;
    sheet.render();
  } finally {
    sheet._isSavingDescription = false;
  }
}
