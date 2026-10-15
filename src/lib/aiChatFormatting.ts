const LATEX_COMMANDS: Array<[RegExp, string]> = [
  [/[\\¥](?:rightarrow|to)\b/g, '→'],
  [/[\\¥]leftarrow\b/g, '←'],
  [/[\\¥]leftrightarrow\b/g, '↔'],
  [/[\\¥]land\b/g, '∧'],
  [/[\\¥]lor\b/g, '∨'],
  [/[\\¥]neg\b/g, '¬'],
  [/[\\¥]oplus\b/g, '⊕'],
  [/[\\¥]neq\b/g, '≠'],
  [/[\\¥]leq?\b/g, '≤'],
  [/[\\¥]geq?\b/g, '≥'],
  [/[\\¥]times\b/g, '×'],
  [/[\\¥]cdot\b/g, '·'],
];

/** Makes common model-generated LaTeX readable in the plain-text chat UI. */
export function formatAiChatContent(content: string) {
  let formatted = content
    .replace(/[\\¥]\[([\s\S]*?)[\\¥]\]/g, '$1')
    .replace(/[\\¥]\(([\s\S]*?)[\\¥]\)/g, '$1')
    .replace(/\$([^$\n]+)\$/g, '$1');

  // Remove common formatting wrappers while retaining their readable content.
  for (let pass = 0; pass < 3; pass++) {
    formatted = formatted.replace(
      /[\\¥](?:text|textrm|mathrm|mathbf|textbf|operatorname)\{([^{}]*)\}/g,
      '$1',
    );
  }

  for (const [command, replacement] of LATEX_COMMANDS) {
    formatted = formatted.replace(command, replacement);
  }

  return formatted;
}
