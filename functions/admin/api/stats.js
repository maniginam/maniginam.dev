export async function onRequestGet(context) {
  const { env } = context;
  const views = [];
  const refs = [];
  let cursor;
  do {
    const list = await env.STATS.list({ limit: 1000, cursor });
    for (const k of list.keys) {
      const val = Number(await env.STATS.get(k.name)) || 0;
      if (k.name.startsWith('views:')) {
        const [, day, ...rest] = k.name.split(':');
        views.push({ day, path: rest.join(':'), count: val });
      } else if (k.name.startsWith('ref:')) {
        const [, day, ...rest] = k.name.split(':');
        refs.push({ day, host: rest.join(':'), count: val });
      }
    }
    cursor = list.list_complete ? undefined : list.cursor;
  } while (cursor);

  views.sort((a, b) => b.count - a.count);
  refs.sort((a, b) => b.count - a.count);
  return json({ views, refs });
}

function json(obj) {
  return new Response(JSON.stringify(obj), {
    headers: { 'Content-Type': 'application/json', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}
