export async function onRequestPost() {
  return new Response(null, {
    status: 204,
    headers: {
      'Set-Cookie': 'admin_session=; HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=0',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
