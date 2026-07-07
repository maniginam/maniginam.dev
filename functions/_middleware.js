// Agent Discovery Middleware for Cloudflare Pages
// Adds Link headers (RFC 8288), handles markdown negotiation

const LINK_HEADER = [
  '</.well-known/api-catalog>; rel="api-catalog"',
  '</feed.xml>; rel="alternate"; type="application/rss+xml"',
  '</.well-known/agent-skills/index.json>; rel="describedby"',
  '</.well-known/mcp/server-card.json>; rel="service-desc"',
].join(', ');

async function countView(context, url) {
  const { request, env } = context;
  if (!env.STATS) return;
  if (request.method !== 'GET') return;
  if (url.pathname.startsWith('/admin')) return;
  const day = new Date().toISOString().slice(0, 10);
  const path = url.pathname;
  const bump = async (key) => {
    const n = Number(await env.STATS.get(key)) || 0;
    await env.STATS.put(key, String(n + 1));
  };
  await bump(`views:${day}:${path}`);
  const ref = request.headers.get('Referer');
  if (ref) {
    try { await bump(`ref:${day}:${new URL(ref).host}`); } catch {}
  }
}

function htmlToMarkdown(html) {
  // Lightweight HTML-to-markdown conversion for static pages
  return html
    // Remove script/style blocks
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    // Extract title
    .replace(/<title>(.*?)<\/title>/i, (_, t) => `# ${t.trim()}\n\n`)
    // Headers
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, (_, c) => `# ${stripTags(c)}\n\n`)
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, (_, c) => `## ${stripTags(c)}\n\n`)
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, (_, c) => `### ${stripTags(c)}\n\n`)
    .replace(/<h4[^>]*>(.*?)<\/h4>/gi, (_, c) => `#### ${stripTags(c)}\n\n`)
    // Links
    .replace(/<a[^>]+href="([^"]*)"[^>]*>(.*?)<\/a>/gi, (_, href, text) => `[${stripTags(text)}](${href})`)
    // Bold/italic
    .replace(/<(strong|b)[^>]*>(.*?)<\/\1>/gi, (_, __, c) => `**${stripTags(c)}**`)
    .replace(/<(em|i)[^>]*>(.*?)<\/\1>/gi, (_, __, c) => `*${stripTags(c)}*`)
    // Code
    .replace(/<code[^>]*>(.*?)<\/code>/gi, (_, c) => `\`${c}\``)
    .replace(/<pre[^>]*>(.*?)<\/pre>/gis, (_, c) => `\`\`\`\n${stripTags(c).trim()}\n\`\`\`\n\n`)
    // Lists
    .replace(/<li[^>]*>(.*?)<\/li>/gi, (_, c) => `- ${stripTags(c).trim()}\n`)
    .replace(/<\/?[ou]l[^>]*>/gi, '\n')
    // Paragraphs and breaks
    .replace(/<p[^>]*>(.*?)<\/p>/gis, (_, c) => `${stripTags(c).trim()}\n\n`)
    .replace(/<br\s*\/?>/gi, '\n')
    // Images
    .replace(/<img[^>]+alt="([^"]*)"[^>]+src="([^"]*)"[^>]*>/gi, (_, alt, src) => `![${alt}](${src})`)
    .replace(/<img[^>]+src="([^"]*)"[^>]*>/gi, (_, src) => `![](${src})`)
    // Horizontal rules
    .replace(/<hr[^>]*>/gi, '\n---\n\n')
    // Strip remaining tags
    .replace(/<[^>]+>/g, '')
    // Decode entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Clean up whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, '');
}

function wantsMarkdown(request) {
  const accept = request.headers.get('Accept') || '';
  return accept.includes('text/markdown');
}

export async function onRequest(context) {
  const response = await context.next();
  const url = new URL(context.request.url);
  const isHTML = (response.headers.get('content-type') || '').includes('text/html');

  if (isHTML) {
    context.waitUntil(countView(context, url));
  }

  // Add Link headers to all HTML responses
  const newResponse = new Response(response.body, response);
  if (isHTML) {
    newResponse.headers.set('Link', LINK_HEADER);
  }

  // Markdown negotiation: serve markdown when requested
  if (isHTML && wantsMarkdown(context.request)) {
    const html = await newResponse.text();
    const md = htmlToMarkdown(html);
    return new Response(md, {
      status: response.status,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Link': LINK_HEADER,
        'Vary': 'Accept',
        'Cache-Control': response.headers.get('Cache-Control') || 'public, max-age=3600',
      },
    });
  }

  if (isHTML) {
    newResponse.headers.append('Vary', 'Accept');
  }

  return newResponse;
}
