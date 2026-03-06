// CF Pages Function — /api/push
// Sends Web Push to all subscribers. Called by engine when notifications are created.

export async function onRequestPost(context) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  try {
    const body = await context.request.json();
    const { title, message, type, password } = body;
    if (password !== 'mars100') return new Response(JSON.stringify({ ok: false }), { status: 401, headers: cors });

    const supaUrl = 'https://swnsgvjrwnqehgvuwojd.supabase.co';
    const supaKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3bnNndmpyd25xZWhndnV3b2pkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY1MzQzNCwiZXhwIjoyMDg4MjI5NDM0fQ.XLaC1_12ZGeqNNjGMOJieMU93q-7mW9tQ2gRCAQlm80';

    // Get all subscriptions
    const subResp = await fetch(`${supaUrl}/rest/v1/push_subscriptions?select=*`, {
      headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` },
    });
    const subs = await subResp.json();
    if (!subs || !subs.length) return new Response(JSON.stringify({ ok: true, sent: 0 }), { headers: cors });

    // VAPID keys
    const vapidPublic = 'BI_I1b8xwJkAN8tFSe3RJWm-6eG1_wc5hjQfxH-8jWTmEKg_Sz_MoH7GHFvxpU8qz90aqfr8FxsO0Uhxtu2e49o';
    const vapidPrivate = 'kNzafs4Nk9kneiKPi-WhARNhoAiUgmsaQgWtERHUiUI';

    const payload = JSON.stringify({ title: title || 'Crypto Mars', body: message || '', type: type || 'system' });

    // Web Push requires crypto operations — use web-push-compatible signing
    // Since CF Workers don't have web-push npm, we'll use the Web Push protocol directly
    let sent = 0;
    for (const sub of subs) {
      try {
        // Build push subscription object
        const pushSub = {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
        };

        // Use CF Worker's built-in crypto for VAPID JWT
        const jwt = await createVapidJwt(sub.endpoint, vapidPublic, vapidPrivate);
        const encrypted = await encryptPayload(payload, sub.keys_p256dh, sub.keys_auth);

        const pushResp = await fetch(sub.endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `vapid t=${jwt.token},k=${vapidPublic}`,
            'Content-Encoding': 'aes128gcm',
            'Content-Type': 'application/octet-stream',
            'TTL': '86400',
          },
          body: encrypted,
        });

        if (pushResp.status === 201 || pushResp.status === 200) sent++;
        else if (pushResp.status === 410 || pushResp.status === 404) {
          // Subscription expired, remove it
          await fetch(`${supaUrl}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, {
            method: 'DELETE',
            headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` },
          });
        }
      } catch (e) { /* skip failed push */ }
    }

    return new Response(JSON.stringify({ ok: true, sent, total: subs.length }), { headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: cors });
  }
}

// VAPID JWT creation using Web Crypto API
async function createVapidJwt(endpoint, publicKey, privateKey) {
  const url = new URL(endpoint);
  const aud = `${url.protocol}//${url.host}`;
  const exp = Math.floor(Date.now() / 1000) + 86400;

  const header = btoa(JSON.stringify({ typ: 'JWT', alg: 'ES256' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payload = btoa(JSON.stringify({ aud, exp, sub: 'mailto:mars25claw@gmail.com' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const unsignedToken = `${header}.${payload}`;

  // Import private key
  const keyData = base64UrlToBuffer(privateKey);
  const pubKeyData = base64UrlToBuffer(publicKey);

  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', d: bufferToBase64Url(keyData), x: bufferToBase64Url(pubKeyData.slice(1, 33)), y: bufferToBase64Url(pubKeyData.slice(33, 65)) },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  );

  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsignedToken));
  const token = `${unsignedToken}.${bufferToBase64Url(new Uint8Array(sig))}`;

  return { token };
}

// Encrypt payload for Web Push (aes128gcm)
async function encryptPayload(payload, p256dhKey, authKey) {
  // This is complex — for now, send notification without payload body
  // The service worker will fetch the latest notification from Supabase instead
  return new Uint8Array(0);
}

function base64UrlToBuffer(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s + pad);
  return new Uint8Array([...bin].map(c => c.charCodeAt(0)));
}

function bufferToBase64Url(buf) {
  return btoa(String.fromCharCode(...buf)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
}
