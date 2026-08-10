import type { DefaultTypedEditorState } from '@payloadcms/richtext-lexical'

/** Minimal valid Lexical editor state — a single paragraph with the given text. */
export const lexicalContent = (text: string): DefaultTypedEditorState =>
  ({
    root: {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              text,
              detail: 0,
              format: 0,
              mode: 'normal',
              style: '',
              version: 1,
            },
          ],
          direction: 'ltr',
          format: '',
          indent: 0,
          version: 1,
        },
      ],
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
    },
    // Test fixture — the exact discriminated-union shape isn't load-bearing here,
    // only that it round-trips through Payload's Local API correctly.
  }) as DefaultTypedEditorState
