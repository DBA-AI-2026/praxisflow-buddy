const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { contractId, customerName } = await req.json();

    if (!contractId || !customerName) {
      return new Response(
        JSON.stringify({ success: false, error: 'contractId and customerName are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[MOCK] Creditreform check for: ${customerName} (contract: ${contractId})`);

    // --- MOCK RESPONSE ---
    // Simulate different results based on customer name for testing
    const lowerName = customerName.toLowerCase();
    let score: number;
    let rating: string;

    if (lowerName.includes('schlecht') || lowerName.includes('risiko')) {
      score = 145;
      rating = 'rot';
    } else if (lowerName.includes('mittel') || lowerName.includes('test')) {
      score = 280;
      rating = 'gelb';
    } else {
      score = 450;
      rating = 'gruen';
    }

    // Add slight randomness for realism
    score = score + Math.floor(Math.random() * 30) - 15;

    const result = {
      success: true,
      data: {
        score,
        rating,
        checkedAt: new Date().toISOString(),
        mock: true,
      },
    };

    console.log(`[MOCK] Result: score=${score}, rating=${rating}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in creditreform-check:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
