export interface MarkdownOptions {
  now: Date;
  timeZone: string;
}

interface Block {
  type: string;
  text?: { text: string };
  fields?: Array<{ text: string }>;
  elements?: Array<Record<string, any>>;
}

const RULE = '───────────────';

function relativeTime(seconds: number, now: Date): string {
  const minutes = Math.round((now.getTime() / 1000 - seconds) / 60);
  if (minutes < 1) return 'hace un momento';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} días`;
}

function localTime(seconds: number, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(seconds * 1000))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

function mrkdwnToMarkdown(text: string, options: MarkdownOptions): string {
  return text
    .replace(/<!date\^(\d+)\^\{ago\}\|[^>]*>/g, (_, seconds) => relativeTime(Number(seconds), options.now))
    .replace(/<!date\^(\d+)\^[^|]*\|[^>]*>/g, (_, seconds) => localTime(Number(seconds), options.timeZone))
    .replace(/<([^|>]+)\|([^>]+)>/g, '[$2]($1)')
    .replace(/(^|[\s(>])\*([^*\n]+)\*/g, '$1**$2**');
}

function richTextToMarkdown(block: Block): string {
  return (block.elements ?? [])
    .map((element) => {
      const parts = (element.elements ?? []) as Array<Record<string, any>>;
      if (element.type === 'rich_text_quote') return `> ${parts.map((part) => part.text ?? '').join('')}`;
      return parts
        .map((part) => {
          if (part.type === 'emoji') return `:${part.name}:`;
          if (part.type === 'link') {
            const link = `[${part.text.trim()}](${part.url})`;
            return part.style?.bold ? ` **${link}**` : ` ${link}`;
          }
          return part.text ?? '';
        })
        .join('');
    })
    .join('\n');
}

/**
 * Renders Block Kit blocks as the markdown accepted by Slack's message tools, resolving Slack date
 * tokens against `now` and `timeZone` because plain markdown cannot carry them.
 */
export function blocksToMarkdown(blocks: unknown[], options: MarkdownOptions): string {
  return (blocks as Block[])
    .map((block) => {
      if (block.type === 'header') return `### ${block.text?.text ?? ''}`;
      if (block.type === 'section' && block.fields) {
        return block.fields.map((field) => mrkdwnToMarkdown(field.text, options).replace('\n', ' — ')).join('\n');
      }
      if (block.type === 'section') return mrkdwnToMarkdown(block.text?.text ?? '', options);
      if (block.type === 'context') {
        return `_${(block.elements ?? []).map((element) => mrkdwnToMarkdown(element.text, options)).join(' ')}_`;
      }
      if (block.type === 'actions') {
        return (block.elements ?? []).map((button) => `[${button.text.text}](${button.url})`).join('   ');
      }
      if (block.type === 'rich_text') return richTextToMarkdown(block);
      if (block.type === 'divider') return RULE;
      return '';
    })
    .filter((line) => line !== '')
    .join('\n\n');
}
