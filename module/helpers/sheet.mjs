export function bindEventListeners(root, eventName, selector, listener) {
  for (const element of root.querySelectorAll(selector)) {
    element.addEventListener(eventName, listener);
  }
}

function getTabGroup(element) {
  return String(
    element?.dataset?.group
    ?? element?.closest?.('[data-group]')?.dataset?.group
    ?? ''
  ).trim();
}

export function syncTabGroup(root, group, activeTab) {
  if (!group || !activeTab) return;

  for (const navItem of root.querySelectorAll('.sheet-tabs [data-tab]')) {
    if (getTabGroup(navItem) !== group) continue;
    navItem.classList.toggle('active', navItem.dataset.tab === activeTab);
  }

  for (const panel of root.querySelectorAll(`.sheet-body [data-group="${group}"][data-tab]`)) {
    panel.classList.toggle('active', panel.dataset.tab === activeTab);
  }
}

export function getActiveTab(sheet, group = 'primary') {
  const tabConfig = sheet.constructor.TABS?.[group];
  return sheet.tabGroups[group] ?? tabConfig?.initial ?? tabConfig?.tabs?.[0]?.id ?? '';
}

export function syncSheetTabState(sheet, root, group = 'primary') {
  const activeTab = getActiveTab(sheet, group);
  if (!activeTab) return;

  sheet.tabGroups[group] = activeTab;
  syncTabGroup(root, group, activeTab);
}

export function getEventTabGroup(event) {
  return getTabGroup(event.currentTarget) || 'primary';
}

export async function submitPendingSheetChanges(sheet) {
  if (!(sheet.form instanceof HTMLFormElement) || !sheet.isEditable) return;
  await sheet.submit();
}
