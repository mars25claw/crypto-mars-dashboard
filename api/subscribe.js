// CF Pages Function — /api/subscribe
// Saves push subscription to Supabase

export async function onRequestPost(context) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
  try {
    const body = await context.request.json();
    const { subscription } = body;
    if (!subscription || !subscription.endpoint) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing subscription' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const supaUrl = 'https://swnsgvjrwnqehgvuwojd.supabase.co';
    const supaKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3bnNndmpyd25xZWhndnV3b2pkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY1MzQzNCwiZXhwIjoyMDg4MjI5NDM0fQ.XLaC1_12ZGeqNNjGMOJieMU93q-7mW9tQ2gRCAQlm80';

    // Upsert subscription
    const resp = await fetch(`${supaUrl}/rest/v1/push_subscriptions`, {
      method: 'POST',
      headers: {
        apikey: supaKey, Authorization: `Bearer ${supaKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        keys_p256dh: subscription.keys.p256dh,
        keys_auth: subscription.keys.auth,
        user_agent: body.userAgent || '',
      }),
    });

    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
}
