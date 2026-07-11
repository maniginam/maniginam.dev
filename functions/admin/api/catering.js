// List catering inquiries (admin-gated via /admin middleware). Newest first.
export async function onRequestGet(context) {
  const { env } = context;
  const inquiries = [];
  let cursor;
  do {
    const list = await env.SIGNUPS.list({ prefix: 'catering:', limit: 1000, cursor });
    for (const k of list.keys) {
      const raw = await env.SIGNUPS.get(k.name);
      if (raw) { try { inquiries.push(JSON.parse(raw)); } catch {} }
    }
    cursor = list.list_complete ? undefined : list.cursor;
  } while (cursor);

  inquiries.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  return new Response(JSON.stringify({ inquiries, count: inquiries.length }), {
    headers: { 'Content-Type': 'application/json', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}
