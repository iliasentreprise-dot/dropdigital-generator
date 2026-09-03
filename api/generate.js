const SUPABASE_URL = 'https://iauypnxtakkqnjdrhivv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_XVi8hx94UZ5tjeEgL1cI8A_q9t4QjjE';

function send(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function responseText(payload) {
  if (typeof payload.output_text === 'string') return payload.output_text;
  return (payload.output || [])
    .flatMap(item => item.content || [])
    .filter(item => item.type === 'output_text')
    .map(item => item.text || '')
    .join('');
}

async function getAuthorizedUser(token) {
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
  });
  if (!userResponse.ok) return null;
  return userResponse.json();
}

async function getPaidPlan(userId, token) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/member_subscriptions`);
  url.searchParams.set('user_id', `eq.${userId}`);
  url.searchParams.set('select', 'plan,status,current_period_end');
  url.searchParams.set('limit', '1');
  const response = await fetch(url, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
  });
  if (!response.ok) return null;
  const [subscription] = await response.json();
  if (!subscription || !['discovery','pro','business'].includes(subscription.plan)) return null;
  if (!['active', 'trialing'].includes(subscription.status)) return null;
  return !subscription.current_period_end || new Date(subscription.current_period_end) > new Date() ? subscription.plan : null;
}

async function monthlyCreationCount(userId, token) {
  const start=new Date();start.setUTCDate(1);start.setUTCHours(0,0,0,0);
  const url=new URL(`${SUPABASE_URL}/rest/v1/member_generations`);url.searchParams.set('user_id',`eq.${userId}`);url.searchParams.set('created_at',`gte.${start.toISOString()}`);url.searchParams.set('select','id');
  const response=await fetch(url,{headers:{apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`}});
  if(!response.ok)throw new Error('usage_count_failed');
  return (await response.json()).length;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Méthode non autorisée.' });

  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return send(res, 401, { error: 'Reconnecte-toi pour générer ton produit.' });

    const user = await getAuthorizedUser(token);
    if (!user) return send(res, 401, { error: 'Ta session a expiré. Reconnecte-toi.' });
    const paidPlan=await getPaidPlan(user.id,token);
    if (!paidPlan) {
      return send(res, 403, { error: 'Un abonnement actif est requis pour la génération automatique.' });
    }
    const isAdmin=String(user.email||'').toLowerCase()==='ilias.entreprise@gmail.com';
    const monthlyLimit={discovery:3,pro:5}[paidPlan];
    if(monthlyLimit&&!isAdmin&&await monthlyCreationCount(user.id,token)>=monthlyLimit)return send(res,429,{error:`Tu as utilisé tes ${monthlyLimit} créations incluses ce mois-ci. Ton compteur sera remis à zéro le mois prochain.`});

    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is missing');
      return send(res, 503, { error: 'Le moteur de génération est en cours de configuration.' });
    }

    const prompt = String(req.body?.prompt || '');
    if (prompt.length < 100 || prompt.length > 50000) {
      return send(res, 400, { error: 'Le brief de génération est invalide.' });
    }

    const aiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        input: [
          {
            role: 'system',
            content: 'Tu produis uniquement le JSON demandé, en français naturel. Le contenu doit être concret, responsable et adapté au brief. N’invente jamais de statistiques, résultats clients ou témoignages présentés comme réels : utilise des emplacements clairement marqués à remplacer lorsqu’une preuve manque.'
          },
          { role: 'user', content: prompt }
        ],
        text: { format: { type: 'json_object' } },
        max_output_tokens: 30000
      })
    });

    const payload = await aiResponse.json();
    if (!aiResponse.ok) {
      console.error('OpenAI generation failed', aiResponse.status, payload?.error?.code || 'unknown');
      return send(res, 502, { error: 'OpenAI n’a pas pu terminer la génération. Réessaie dans un instant.' });
    }

    const raw = responseText(payload);
    let product;
    try {
      product = JSON.parse(raw);
    } catch (error) {
      console.error('OpenAI returned invalid JSON', error);
      return send(res, 502, { error: 'La génération est arrivée incomplète. Réessaie.' });
    }

    return send(res, 200, { product });
  } catch (error) {
    console.error('Generation route failed', error);
    return send(res, 500, { error: 'Erreur temporaire du moteur de génération.' });
  }
}
