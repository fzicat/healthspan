import { Fragment, type ReactNode } from 'react'

// Minimal renderer for coach-written markdown: headings, bullet/numbered
// lists, **bold**, _italic_ / *italic* and paragraphs. Anything else is plain text.
// Italic needs a word boundary outside the markers so snake_case stays literal.
const INLINE = /(\*\*[^*]+\*\*|(?<![\w*])\*[^*\s][^*]*\*(?![\w*])|(?<!\w)_[^_\s][^_]*_(?!\w))/g

function inline(text: string): ReactNode {
    return text.split(INLINE).map((part, i) => {
        if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
        if (part.length > 2 && ((part.startsWith('_') && part.endsWith('_')) || (part.startsWith('*') && part.endsWith('*')))) return <em key={i}>{part.slice(1, -1)}</em>
        return <Fragment key={i}>{part}</Fragment>
    })
}

export function Markdown({ text }: { text: string }) {
    const blocks: ReactNode[] = []
    let list: { ordered: boolean; items: string[] } | null = null
    let paragraph: string[] = []

    const flush = () => {
        if (paragraph.length) {
            blocks.push(<p key={blocks.length}>{inline(paragraph.join(' '))}</p>)
            paragraph = []
        }
        if (list) {
            const items = list.items.map((item, i) => <li key={i}>{inline(item)}</li>)
            blocks.push(list.ordered
                ? <ol key={blocks.length} className="list-decimal pl-5 space-y-1">{items}</ol>
                : <ul key={blocks.length} className="list-disc pl-5 space-y-1">{items}</ul>)
            list = null
        }
    }

    for (const raw of text.split('\n')) {
        const line = raw.trim()
        const heading = line.match(/^(#{1,4})\s+(.*)$/)
        const bullet = line.match(/^[-*]\s+(.*)$/)
        const numbered = line.match(/^\d+[.)]\s+(.*)$/)
        if (!line) {
            flush()
        } else if (heading) {
            flush()
            blocks.push(<h4 key={blocks.length} className="font-semibold text-foreground pt-1">{inline(heading[2])}</h4>)
        } else if (bullet || numbered) {
            const ordered = !!numbered
            if (paragraph.length || (list && list.ordered !== ordered)) flush()
            list ??= { ordered, items: [] }
            list.items.push((bullet ?? numbered)![1])
        } else if (list && raw.startsWith(' ')) {
            // Indented continuation of the previous list item.
            list.items[list.items.length - 1] += ` ${line}`
        } else {
            if (list) flush()
            paragraph.push(line)
        }
    }
    flush()

    return <div className="space-y-2 text-sm break-words">{blocks}</div>
}
