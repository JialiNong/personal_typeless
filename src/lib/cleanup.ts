const ENGLISH_FILLERS = [
  /\b(?:um+|uh+|er+|ah+|hmm+|huh)\b/gi,
  /\b(?:you know)\b/gi,
  /\b(?:i mean)\b/gi,
  /\b(?:kind of|sort of)\b/gi,
];

const CHINESE_FILLERS = [
  /那个那个/g,
  /就是就是/g,
  /然后然后/g,
  /[嗯啊呃额]/g,
  /那个/g,
  /就是说/g,
  /的话(?=[，。,\s]|$)/g,
];

function collapseSpace(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n+ */g, "\n")
    .replace(/[ ]+([,.;:!?，。！？、])/g, "$1")
    .replace(/([,.;:!?，。！？、]){2,}/g, "$1")
    .trim();
}

function capitalizeLatin(text: string): string {
  return text.replace(/(^|[.!?]\s+)([a-z])/g, (_, prefix: string, letter: string) => {
    return `${prefix}${letter.toUpperCase()}`;
  });
}

export function cleanTranscriptLocally(raw: string): string {
  let text = raw.trim();
  if (!text) return "";

  for (const pattern of ENGLISH_FILLERS) {
    text = text.replace(pattern, " ");
  }
  for (const pattern of CHINESE_FILLERS) {
    text = text.replace(pattern, "");
  }

  text = collapseSpace(text);
  text = capitalizeLatin(text);

  return text;
}
