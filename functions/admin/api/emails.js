export async function onRequestGet(context) {
  const { env } = context;
  const signups = [];
  let cursor;
  do {
    const list = await env.SIGNUPS.list({ prefix: 'signup:', limit: 1000, cursor });
    for (const k of list.keys) {
      const raw = await env.SIGNUPS.get(k.name);
      if (raw) { try { signups.push(JSON.parse(raw)); } catch {} }
    }
    cursor = list.list_complete ? undefined : list.cursor;
  } while (cursor);

  signups.sort((a, b) => (a.ts < b.ts ? 1 : -1)); // newest first
  return new Response(JSON.stringify({ signups, count: signups.length }), {
    headers: { 'Content-Type': 'application/json', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}
