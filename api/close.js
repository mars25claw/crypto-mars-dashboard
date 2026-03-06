// Cloudflare Pages Function — /api/close
// Places a Take Profit at the current live price to close a position

export async function onRequestPost(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  try {
    const body = await context.request.json();
    const { sym, price, password } = body;

    // Auth check
    if (password !== 'mars100') {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!sym || !price) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing sym or price' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check mode from Supabase
    const supaUrl = 'https://swnsgvjrwnqehgvuwojd.supabase.co';
    const supaKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3bnNndmpyd25xZWhndnV3b2pkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY1MzQzNCwiZXhwIjoyMDg4MjI5NDM0fQ.XLaC1_12ZGeqNNjGMOJieMU93q-7mW9tQ2gRCAQlm80';

    // Get heartbeat to check mode
    const hbResp = await fetch(`${supaUrl}/rest/v1/heartbeat?node=eq.mac&limit=1`, {
      headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` }
    });
    const hb = await hbResp.json();
    const mode = hb[0]?.mode || 'TEST';

    if (mode === 'TEST') {
      // SIM MODE — close via sim-engine by updating Supabase
      // Push a notification and let the engine pick it up
      // Actually, for sim mode, we set TP = current price so next monitor tick closes it
      const posResp = await fetch(`${supaUrl}/rest/v1/positions?sym=eq.${sym}&limit=1`, {
        headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` }
      });
      const positions = await posResp.json();
      if (!positions || !positions.length) {
        return new Response(JSON.stringify({ ok: false, error: `No open position for ${sym}` }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Push close command notification — engine will pick up on next tick
      await fetch(`${supaUrl}/rest/v1/notifications`, {
        method: 'POST',
        headers: {
          apikey: supaKey,
          Authorization: `Bearer ${supaKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          type: 'close_command',
          title: `📤 Close ${sym.replace('USDT', '')} requested`,
          message: `TP set to $${price} from dashboard`,
          sym: sym,
          data: JSON.stringify({ price: price, action: 'set_tp' }),
        }),
      });

      // Update TP in positions table
      await fetch(`${supaUrl}/rest/v1/positions?sym=eq.${sym}`, {
        method: 'PATCH',
        headers: {
          apikey: supaKey,
          Authorization: `Bearer ${supaKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ tp: price }),
      });

      return new Response(JSON.stringify({
        ok: true,
        mode: 'TEST',
        message: `TP set to $${price} for ${sym}. Will close on next price tick.`,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // REAL MODE — place TP order on Bybit
    const apiKey = 'DOO0AgKDH0jsLOi7QM';
    const apiSecret = 'kJT5qwGF0oEU2qjYCQyGuomQjh76V3wrMOOI';

    // Get position info from Bybit
    const timestamp = Date.now().toString();
    const recvWindow = '20000';

    // Helper: HMAC-SHA256 signature
    async function sign(message) {
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw', encoder.encode(apiSecret),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
      );
      const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
      return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // First: get current position to know qty and side
    const getParams = `category=linear&symbol=${sym}`;
    const getSignStr = `${timestamp}${apiKey}${recvWindow}${getParams}`;
    const getSig = await sign(getSignStr);

    const posResponse = await fetch(`https://api.bybit.com/v5/position/list?${getParams}`, {
      headers: {
        'X-BAPI-API-KEY': apiKey,
        'X-BAPI-SIGN': getSig,
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': recvWindow,
      },
    });
    const posData = await posResponse.json();

    if (posData.retCode !== 0) {
      return new Response(JSON.stringify({ ok: false, error: `Bybit error: ${posData.retMsg}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const positions_list = posData.result?.list || [];
    const pos = positions_list.find(p => parseFloat(p.size) > 0);

    if (!pos) {
      return new Response(JSON.stringify({ ok: false, error: `No open position for ${sym} on Bybit` }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const qty = pos.size;
    const side = pos.side === 'Buy' ? 'Sell' : 'Buy'; // Opposite side to close

    // Place a limit close order at the requested price
    const orderBody = JSON.stringify({
      category: 'linear',
      symbol: sym,
      side: side,
      orderType: 'Limit',
      qty: qty,
      price: price.toString(),
      reduceOnly: true,
      timeInForce: 'GTC',
    });

    const orderTs = Date.now().toString();
    const orderSignStr = `${orderTs}${apiKey}${recvWindow}${orderBody}`;
    const orderSig = await sign(orderSignStr);

    const orderResp = await fetch('https://api.bybit.com/v5/order/create', {
      method: 'POST',
      headers: {
        'X-BAPI-API-KEY': apiKey,
        'X-BAPI-SIGN': orderSig,
        'X-BAPI-TIMESTAMP': orderTs,
        'X-BAPI-RECV-WINDOW': recvWindow,
        'Content-Type': 'application/json',
      },
      body: orderBody,
    });
    const orderData = await orderResp.json();

    if (orderData.retCode !== 0) {
      return new Response(JSON.stringify({ ok: false, error: `Order failed: ${orderData.retMsg}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Push notification
    await fetch(`${supaUrl}/rest/v1/notifications`, {
      method: 'POST',
      headers: {
        apikey: supaKey,
        Authorization: `Bearer ${supaKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        type: 'trade_close',
        title: `📤 ${sym.replace('USDT', '')} Close order placed`,
        message: `Limit ${side} ${qty} @ $${price}`,
        sym: sym,
        data: JSON.stringify({ price, qty, side, orderId: orderData.result?.orderId }),
      }),
    });

    return new Response(JSON.stringify({
      ok: true,
      mode: 'REAL',
      message: `Limit close order placed: ${side} ${qty} ${sym} @ $${price}`,
      orderId: orderData.result?.orderId,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      }
    });
  }
}

// CORS preflight
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
