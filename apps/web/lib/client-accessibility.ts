import type {AccessibilityAuditIssue} from './data-service';

export type ClientAccessibilityAuditResult = {
  score: number;
  issues: AccessibilityAuditIssue[];
};

type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const autoNames = new WeakMap<Element, string>();
const autoNameAttribute = 'data-kidum-a11y-name';
const normalizeText = (value: string | null | undefined) => (value || '').replace(/\s+/g, ' ').trim();

function queryElements(root: ParentNode, selector: string): Element[] {
  const elements = Array.from(root.querySelectorAll(selector));
  if ((root as Node).nodeType === 1 && (root as Element).matches(selector)) {
    elements.unshift(root as Element);
  }
  return elements;
}

function ownerDocument(root: ParentNode): Document | null {
  if ((root as Node).nodeType === 9) return root as Document;
  return (root as Node).ownerDocument || (typeof document !== 'undefined' ? document : null);
}

function isHidden(element: Element): boolean {
  if (element.matches('input[type="hidden"]') || element.closest('[hidden], [inert], [aria-hidden="true"]')) return true;
  const view = element.ownerDocument.defaultView;
  if (view) {
    const elementVisibility = view.getComputedStyle(element).visibility;
    if (elementVisibility === 'hidden' || elementVisibility === 'collapse') return true;
    for (let current: Element | null = element; current; current = current.parentElement) {
      const style = view.getComputedStyle(current);
      if (style.display === 'none') return true;
    }
  }
  for (let details = element.closest('details:not([open])'); details; details = details.parentElement?.closest('details:not([open])') || null) {
    const summary = Array.from(details.children).find(child => child.tagName === 'SUMMARY');
    if (!summary?.contains(element)) return true;
  }
  return false;
}

// A limited text-name resolver for this structural audit. Never read form values
// while resolving labels, and do not confuse a select's options with its label.
function textName(element: Element, includeHidden = false): string {
  const parts: string[] = [];
  const visit = (node: Node) => {
    if (node.nodeType === 3) {
      parts.push(node.textContent || '');
      return;
    }
    if (node.nodeType !== 1) return;
    const child = node as Element;
    if (child.matches('script, style, template, input, select, textarea')) return;
    if (!includeHidden && (child.hasAttribute('hidden') || child.getAttribute('aria-hidden') === 'true' || child.hasAttribute('inert'))) return;
    if (child.tagName === 'IMG') {
      parts.push(child.getAttribute('alt') || '');
      return;
    }
    if (child !== element && normalizeText(child.getAttribute('aria-label'))) {
      parts.push(child.getAttribute('aria-label') || '');
      return;
    }
    child.childNodes.forEach(visit);
  };
  visit(element);
  return normalizeText(parts.join(' '));
}

function labelledByName(element: Element): string {
  const ids = normalizeText(element.getAttribute('aria-labelledby')).split(' ').filter(Boolean);
  if (!ids.length) return '';
  const targets = ids.map(id => element.ownerDocument.getElementById(id));
  if (targets.some(target => !target)) return '';
  // Explicitly referenced hidden text may supply an accessible name.
  return normalizeText(targets.map(target => textName(target!, true)).join(' '));
}

function nativeLabelName(element: Element): string {
  const labels = (element as FormControl).labels;
  return labels ? normalizeText(Array.from(labels).map(label => textName(label)).join(' ')) : '';
}

function usefulInferredName(value: string): boolean {
  if (!/\p{L}/u.test(value)) return false;
  if (/^(?:שדה|בחירה|אפשרות|טקסט חופשי|תאריך|מספר|field|input|select|option|text|number|date|choose|select one)[\s.…:]*$/i.test(value)) return false;
  if (/^(?:https?:\/\/\S*|[^\s@]+@[^\s@]+\.[^\s@]+|yyyy[-/]mm[-/]dd)$/i.test(value)) return false;
  return true;
}

function accessibleName(element: Element, options: {ignoreAutoLabel?: boolean; content?: boolean} = {}): string {
  const references = labelledByName(element);
  if (references) return references;
  const ariaLabel = normalizeText(element.getAttribute('aria-label'));
  const isAuto = element.getAttribute(autoNameAttribute) === 'auto';
  if (ariaLabel && !(options.ignoreAutoLabel && isAuto) && (!isAuto || usefulInferredName(ariaLabel))) return ariaLabel;
  const nativeLabel = nativeLabelName(element);
  if (nativeLabel) return nativeLabel;
  if (element.tagName === 'INPUT') {
    const input = element as HTMLInputElement;
    if (input.type === 'image') return normalizeText(input.alt);
    if (['button', 'submit', 'reset'].includes(input.type)) {
      return normalizeText(input.value) || (input.type === 'submit' ? 'Submit' : input.type === 'reset' ? 'Reset' : '');
    }
  }
  if (options.content) {
    const content = textName(element);
    if (content) return content;
  }
  return normalizeText(element.getAttribute('title'));
}

function inferredControlName(element: FormControl): string {
  const parent = element.parentElement;
  const previous = element.previousElementSibling;
  // Only use a single adjacent caption for a single-control container. A
  // section heading must not become the identical name of every field.
  if (parent && previous?.matches('span, b, strong') && parent.querySelectorAll('input, select, textarea').length === 1 && !previous.querySelector('input, select, textarea, button, a')) {
    const nearby = textName(previous);
    if (usefulInferredName(nearby)) return nearby;
  }
  const placeholder = normalizeText(element.getAttribute('placeholder'));
  return usefulInferredName(placeholder) ? placeholder : '';
}

/** Supply only names supported by descriptive text already on the control. */
export function ensureAccessibleNames(root: ParentNode): void {
  for (const element of queryElements(root, 'input, select, textarea') as FormControl[]) {
    if (element.tagName === 'INPUT' && (element as HTMLInputElement).type === 'hidden') continue;
    const previousAutoName = autoNames.get(element);
    const currentLabel = element.getAttribute('aria-label');
    let ownsLabel = element.getAttribute(autoNameAttribute) === 'auto';
    // A React render or another author can replace a generated label. Preserve it.
    if (previousAutoName !== undefined && currentLabel !== previousAutoName) {
      autoNames.delete(element);
      element.removeAttribute(autoNameAttribute);
      ownsLabel = false;
    }
    if (accessibleName(element, {ignoreAutoLabel: ownsLabel}) || normalizeText(element.getAttribute('aria-labelledby'))) {
      if (ownsLabel) {
        element.removeAttribute('aria-label');
        element.removeAttribute(autoNameAttribute);
        autoNames.delete(element);
      }
      continue;
    }
    const inferred = inferredControlName(element);
    if (!inferred) {
      if (ownsLabel) {
        element.removeAttribute('aria-label');
        element.removeAttribute(autoNameAttribute);
        autoNames.delete(element);
      }
      continue;
    }
    if (currentLabel !== inferred) element.setAttribute('aria-label', inferred);
    if (!ownsLabel) element.setAttribute(autoNameAttribute, 'auto');
    autoNames.set(element, inferred);
  }
}

/** Keep generated names current; all calls in a render batch share one scan. */
export function observeAccessibleNames(root: ParentNode): () => void {
  const view = ownerDocument(root)?.defaultView;
  ensureAccessibleNames(root);
  if (!view?.MutationObserver) return () => {};
  let disposed = false;
  let pending: number | null = null;
  const useAnimationFrame = typeof view.requestAnimationFrame === 'function';
  const options: MutationObserverInit = {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['placeholder', 'aria-label', 'aria-labelledby', 'id', 'for', 'title', 'type', 'hidden', 'aria-hidden'],
  };
  const update = () => {
    pending = null;
    if (disposed) return;
    // Our aria-label writes are not observed, preventing self-triggered scans.
    observer.disconnect();
    try {
      ensureAccessibleNames(root);
    } finally {
      if (!disposed) observer.observe(root as Node, options);
    }
  };
  const observer = new view.MutationObserver(() => {
    if (pending !== null || disposed) return;
    pending = useAnimationFrame ? view.requestAnimationFrame(update) : view.setTimeout(update, 0);
  });
  observer.observe(root as Node, options);
  return () => {
    disposed = true;
    observer.disconnect();
    if (pending !== null) {
      if (useAnimationFrame) view.cancelAnimationFrame(pending);
      else view.clearTimeout(pending);
    }
  };
}

function structuralSample(element: Element): string {
  const tag = element.tagName.toLowerCase();
  // Do not persist outerHTML, text, IDs, URLs, names, or current input values.
  if (tag === 'input') return `<input type="${(element as HTMLInputElement).type}">`;
  return `<${tag}>`;
}

/** Read-only structural checks; this is not a full WCAG conformance audit. */
export function runClientAccessibilityAudit(root?: ParentNode): ClientAccessibilityAuditResult {
  const doc = root ? ownerDocument(root) : (typeof document !== 'undefined' ? document : null);
  if (!doc) throw new Error('בדיקת נגישות זמינה בדפדפן בלבד');
  const scope = root || doc.querySelector('#kidum-main-content') || doc.body;
  const issues: AccessibilityAuditIssue[] = [];
  const visible = (selector: string) => queryElements(scope, selector).filter(element => !isHidden(element));
  const add = (code: string, severity: AccessibilityAuditIssue['severity'], title: string, nodes: Element[]) => {
    if (nodes.length) issues.push({code, severity, title, count: nodes.length, sample: structuralSample(nodes[0])});
  };

  add('IMG_ALT', 'HIGH', 'תמונות ללא טקסט חלופי', visible('img:not([alt])'));
  add('FORM_NAME', 'HIGH', 'שדות טופס ללא שם נגיש', visible('input, select, textarea').filter(element => !accessibleName(element)));
  add('BUTTON_NAME', 'HIGH', 'כפתורים ללא שם נגיש', visible('button').filter(element => !accessibleName(element, {content: true})));
  add('LINK_NAME', 'HIGH', 'קישורים ללא שם נגיש', visible('a[href]').filter(element => !accessibleName(element, {content: true})));
  add('IFRAME_TITLE', 'MEDIUM', 'מסגרות iframe ללא כותרת', visible('iframe').filter(element => !normalizeText(element.getAttribute('title'))));
  add('POSITIVE_TABINDEX', 'MEDIUM', 'רכיבים עם tabindex חיובי', visible('[tabindex]').filter(element => Number(element.getAttribute('tabindex')) > 0));

  const ids = new Map<string, Element[]>();
  queryElements(doc, '[id]').forEach(element => {
    if (element.id) ids.set(element.id, [...(ids.get(element.id) || []), element]);
  });
  add('DUPLICATE_ID', 'HIGH', 'מזהי HTML כפולים', Array.from(ids.values()).filter(elements => elements.length > 1).flat());
  let previousHeading = 0;
  const badHeadings: Element[] = [];
  for (const heading of visible('h1, h2, h3, h4, h5, h6')) {
    const level = Number(heading.tagName.slice(1));
    if (previousHeading && level > previousHeading + 1) badHeadings.push(heading);
    previousHeading = level;
  }
  add('HEADING_ORDER', 'MEDIUM', 'דילוגים בהיררכיית כותרות', badHeadings);
  add('TABLE_HEADERS', 'MEDIUM', 'טבלאות ללא תאי כותרת', visible('table').filter(element => !element.matches('[role="presentation"], [role="none"]') && !element.querySelector('th')));
  add('DIALOG_NAME', 'HIGH', 'חלונות dialog ללא שם נגיש', visible('[role="dialog"], [role="alertdialog"], dialog[open]').filter(element => !accessibleName(element)));
  add('EMPTY_LABEL', 'MEDIUM', 'תוויות טופס ריקות', visible('label').filter(element => !textName(element)));
  add('ARIA_REFERENCE', 'HIGH', 'הפניות ARIA חסרות או ללא טקסט לתווית', visible('[aria-labelledby]').filter(element => !labelledByName(element)));
  add('NON_SEMANTIC_CLICK', 'MEDIUM', 'רכיב לחיץ לא־סמנטי ללא תמיכת מקלדת', visible('div[onclick], span[onclick]').filter(element => !element.hasAttribute('role') && !element.hasAttribute('tabindex')));
  add('AUTOFOCUS', 'LOW', 'שימוש ב-autofocus הדורש בדיקה ידנית', visible('[autofocus]'));
  const weights = {CRITICAL: 20, HIGH: 8, MEDIUM: 3, LOW: 1};
  const penalty = issues.reduce((total, issue) => total + weights[issue.severity] * issue.count, 0);
  return {score: Math.max(0, 100 - penalty), issues};
}
