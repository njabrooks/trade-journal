// TradingView Webhook Handler for Strategy Signals
// Receives alerts from TradingView and triggers matching signals
//
// Expected payload from TradingView:
// {
//   "ticker": "{{ticker}}",
//   "exchange": "{{exchange}}",
//   "alertName": "{{alertname}}",
//   "price": {{close}},
//   "time": "{{timenow}}",
//   "interval": "{{interval}}"
// }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Types
interface TVWebhookPayload {
  ticker: string
  alertName: string
  price?: number
  exchange?: string
  time?: string
  interval?: string
}

interface Signal {
  id: string
  entity_type: string
  strategy_id: string | null
  statement: string
  type: string
  importance: string
  status: string
  explicit_details: {
    tvAlertName?: string
    recommendedAction?: string
    actionNotes?: string
    conditions?: Array<{
      type: string
      value: number
      ticker?: string
    }>
  } | null
}

interface Strategy {
  id: string
  strategy_key: string
  auto_derived_label: string | null
  underlying_ticker: string | null
}

// CORS headers for preflight requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Validate incoming payload
function validatePayload(body: unknown): TVWebhookPayload | null {
  if (!body || typeof body !== 'object') return null

  const payload = body as Record<string, unknown>

  // Required fields
  if (typeof payload.ticker !== 'string' || !payload.ticker) return null
  if (typeof payload.alertName !== 'string' || !payload.alertName) return null

  return {
    ticker: payload.ticker,
    alertName: payload.alertName,
    price: typeof payload.price === 'number' ? payload.price : undefined,
    exchange: typeof payload.exchange === 'string' ? payload.exchange : undefined,
    time: typeof payload.time === 'string' ? payload.time : undefined,
    interval: typeof payload.interval === 'string' ? payload.interval : undefined,
  }
}

// Main handler
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    // Parse request body
    const body = await req.json()
    console.log('Received webhook payload:', JSON.stringify(body))

    // Validate payload
    const payload = validatePayload(body)
    if (!payload) {
      console.error('Invalid payload structure:', body)
      return new Response(
        JSON.stringify({
          error: 'Invalid payload',
          required: ['ticker', 'alertName'],
          received: body
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase credentials')
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Find matching signals
    // Match by: tvAlertName in explicit_details AND (strategy's underlying_ticker = payload.ticker OR condition ticker = payload.ticker)
    const { data: signals, error: signalsError } = await supabase
      .from('validation_points')
      .select(`
        id,
        entity_type,
        strategy_id,
        statement,
        type,
        importance,
        status,
        explicit_details
      `)
      .eq('entity_type', 'strategy')
      .in('status', ['not_triggered', 'monitoring'])

    if (signalsError) {
      console.error('Error fetching signals:', signalsError)
      return new Response(
        JSON.stringify({ error: 'Database error', details: signalsError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Filter signals that match the alert name (case-insensitive)
    const matchingSignals = (signals || []).filter((signal: Signal) => {
      const details = signal.explicit_details
      if (!details?.tvAlertName) return false

      // Case-insensitive alert name match
      return details.tvAlertName.toLowerCase() === payload.alertName.toLowerCase()
    })

    if (matchingSignals.length === 0) {
      console.log(`No matching signals found for alert: ${payload.alertName}`)
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No matching signals found',
          alertName: payload.alertName,
          ticker: payload.ticker
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Found ${matchingSignals.length} matching signal(s)`)

    // Process each matching signal
    const results = []
    for (const signal of matchingSignals) {
      try {
        // Get strategy details for the triage record
        let strategy: Strategy | null = null
        if (signal.strategy_id) {
          const { data: strategyData } = await supabase
            .from('strategies')
            .select('id, strategy_key, auto_derived_label, underlying_ticker')
            .eq('id', signal.strategy_id)
            .single()
          strategy = strategyData
        }

        // Verify ticker matches strategy's underlying (if strategy has one)
        if (strategy?.underlying_ticker &&
            strategy.underlying_ticker.toUpperCase() !== payload.ticker.toUpperCase()) {
          console.log(`Ticker mismatch: signal expects ${strategy.underlying_ticker}, got ${payload.ticker}`)
          results.push({
            signalId: signal.id,
            status: 'skipped',
            reason: 'ticker_mismatch'
          })
          continue
        }

        // Update signal status to 'triggered'
        const { error: updateError } = await supabase
          .from('validation_points')
          .update({
            status: 'triggered',
            updated_at: new Date().toISOString()
          })
          .eq('id', signal.id)

        if (updateError) {
          console.error(`Error updating signal ${signal.id}:`, updateError)
          results.push({
            signalId: signal.id,
            status: 'error',
            reason: updateError.message
          })
          continue
        }

        // Create triage record
        const details = signal.explicit_details
        const recommendedAction = details?.recommendedAction || 'REVIEW_SIGNAL'

        const triageRecord = {
          strategy_id: signal.strategy_id,
          severity: signal.importance === 'critical' ? 'urgent' :
                   signal.importance === 'significant' ? 'attention' : 'monitor',
          urgency: signal.type === 'warning' ? 'high' : 'medium',
          recommended_action: recommendedAction,
          reasons: JSON.stringify([
            `Signal triggered: ${signal.statement}`,
            `TradingView alert: ${payload.alertName}`,
            `Price: ${payload.price ?? 'N/A'}`,
            details?.actionNotes ? `Notes: ${details.actionNotes}` : null
          ].filter(Boolean)),
          source: 'tradingview_webhook',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }

        const { data: newTriage, error: triageError } = await supabase
          .from('triage_records')
          .insert(triageRecord)
          .select('id')
          .single()

        if (triageError) {
          console.error(`Error creating triage for signal ${signal.id}:`, triageError)
          results.push({
            signalId: signal.id,
            status: 'partial',
            reason: 'triage_creation_failed',
            triageError: triageError.message
          })
          continue
        }

        // Log to journal
        const journalEntry = {
          object_type: 'strategy',
          object_id: signal.strategy_id,
          object_title: strategy?.auto_derived_label || strategy?.strategy_key || 'Unknown Strategy',
          action_type: 'signal_triggered',
          action_description: `TradingView alert "${payload.alertName}" triggered signal: ${signal.statement}`,
          previous_state: JSON.stringify({ status: 'not_triggered' }),
          new_state: JSON.stringify({
            status: 'triggered',
            triggeredAt: new Date().toISOString(),
            triggerPrice: payload.price,
            triageRecordId: newTriage?.id
          }),
          source: 'tradingview_webhook',
          metadata: JSON.stringify({
            signalId: signal.id,
            alertName: payload.alertName,
            ticker: payload.ticker,
            price: payload.price,
            exchange: payload.exchange
          }),
          created_at: new Date().toISOString()
        }

        await supabase
          .from('journal_entries')
          .insert(journalEntry)

        results.push({
          signalId: signal.id,
          status: 'triggered',
          triageRecordId: newTriage?.id,
          recommendedAction
        })

        console.log(`Successfully triggered signal ${signal.id}`)
      } catch (err) {
        console.error(`Error processing signal ${signal.id}:`, err)
        results.push({
          signalId: signal.id,
          status: 'error',
          reason: err instanceof Error ? err.message : 'Unknown error'
        })
      }
    }

    // Return summary
    const triggered = results.filter(r => r.status === 'triggered').length
    const skipped = results.filter(r => r.status === 'skipped').length
    const errors = results.filter(r => r.status === 'error' || r.status === 'partial').length

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          alertName: payload.alertName,
          ticker: payload.ticker,
          price: payload.price,
          triggered,
          skipped,
          errors,
          total: matchingSignals.length
        },
        results
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Webhook handler error:', err)
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: err instanceof Error ? err.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
