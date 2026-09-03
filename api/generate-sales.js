const SUPABASE_URL = 'https://iauypnxtakkqnjdrhivv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_XVi8hx94UZ5tjeEgL1cI8A_q9t4QjjE';

function send(res, status, body) {
  res
    .status(status)
    .setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function hasProAccess(token) {
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!userResponse.ok) return false;

  const user = await userResponse.json();

  const url = new URL(`${SUPABASE_URL}/rest/v1/member_subscriptions`);
  url.searchParams.set('user_id', `eq.${user.id}`);
  url.searchParams.set('select', 'plan,status,current_period_end');
  url.searchParams.set('limit', '1');

  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) return false;

  const [sub] = await response.json();

  return Boolean(
    sub &&
      ['discovery', 'pro', 'business'].includes(sub.plan) &&
      ['active', 'trialing'].includes(sub.status) &&
      (!sub.current_period_end ||
        new Date(sub.current_period_end) > new Date())
  );
}

function cleanClaudeHtml(text) {
  return String(text || '')
    .trim()
    .replace(/^```html\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

function isCompleteHtml(html, minimumLength) {
  const value = String(html || '').trim();

  return (
    /^<!doctype html>/i.test(value) &&
    /<\/html>\s*$/i.test(value) &&
    value.length >= minimumLength
  );
}

async function callClaude(prompt, maxTokens) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: maxTokens,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    console.error('Claude API error', {
      status: response.status,
      type: payload?.error?.type || 'unknown',
      message: payload?.error?.message || 'unknown',
    });
    throw new Error('CLAUDE_API_ERROR');
  }

  const text = (payload.content || [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('');

  const cleaned = cleanClaudeHtml(text);

  console.log('Claude response received', {
    stopReason: payload?.stop_reason || 'unknown',
    outputLength: cleaned.length,
    usage: payload?.usage || null,
  });

  return {
    text: cleaned,
    stopReason: payload?.stop_reason || null,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return send(res, 405, {
      error: 'Méthode non autorisée.',
    });
  }

  try {
    const token = String(req.headers.authorization || '').replace(
      /^Bearer\s+/i,
      ''
    );

    if (!token || !(await hasProAccess(token))) {
      return send(res, 403, {
        error: 'Le plan Pro actif est requis.',
      });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return send(res, 503, {
        error: 'La clé API Claude doit encore être connectée dans Vercel.',
      });
    }

    const product = req.body?.product || {};
    const brief = req.body?.brief || {};
    const theme = req.body?.theme || {};

    const freeLovablePrompt = String(
      req.body?.lovablePrompt || product.prompt_lovable || ''
    ).trim();

    const productTitle = String(
      brief.offre ||
      product.titre_produit ||
      product.title ||
      ''
    ).trim();

    const salesPrompt = `
Tu es à la fois un copywriter de conversion francophone d'élite,
un directeur artistique digital et un développeur front-end senior.

Crée UNIQUEMENT la page de vente principale complète.

PROMPT LOVABLE :
${freeLovablePrompt}

QUESTIONNAIRE :
${JSON.stringify(brief)}

THÈME :
${JSON.stringify(theme)}

PRODUIT :
${JSON.stringify(product)}

TITRE :
${productTitle}

Retourne UNIQUEMENT un document HTML autonome.

Règles absolues :
- commence exactement par <!doctype html>
- termine exactement par </html>
- aucun markdown
- aucune explication
- ne génère PAS l'upsell
- page responsive
- design premium adapté au produit
- copywriting spécifique
- aucun faux témoignage
- aucune fausse statistique
- aucune fausse urgence

La page doit inclure un bloc avec exactement :

id="order-bump"

Ce bloc doit contenir :
- une checkbox non cochée par défaut
- une offre complémentaire
- un prix
- un total sans bump
- un total avec bump
- du JavaScript qui met à jour le total

Tous les CTA principaux doivent mener vers #order-bump.

Retourne uniquement le HTML final.
`;

    const upsellPrompt = `
Tu es un copywriter de conversion francophone et développeur front-end senior.

Crée UNIQUEMENT la page UPSELL 1 après achat.

QUESTIONNAIRE :
${JSON.stringify(brief)}

THÈME :
${JSON.stringify(theme)}

PRODUIT :
${JSON.stringify(product)}

TITRE :
${productTitle}

Retourne UNIQUEMENT un document HTML autonome.

Règles :
- commence par <!doctype html>
- termine par </html>
- aucun markdown
- aucun texte hors HTML
- fond blanc
- texte presque noir
- largeur proche de 640px
- une seule couleur d'accent
- grand titre commençant par "Attends…"
- une seule offre complémentaire logique
- bénéfices
- ancien prix
- nouveau prix
- bouton principal vers #upsell-checkout
- lien "Non merci"
- FAQ courte
- aucun faux témoignage
- aucune fausse urgence

Le JavaScript doit récupérer customerId et paymentMethodId depuis :
new URLSearchParams(window.location.search)

Retourne uniquement le HTML final.
`;

    console.log('Starting Claude funnel generation');

    const [salesResult, upsellResult] = await Promise.all([
      callClaude(salesPrompt, 16000),
      callClaude(upsellPrompt, 9000),
    ]);

    const html = salesResult.text;
    const upsellHtml = upsellResult.text;

    if (!isCompleteHtml(html, 3000)) {
      console.error('Incomplete sales page returned by Claude', {
        length: html.length,
        startsWithDoctype: /^<!doctype html>/i.test(html),
        endsWithHtml: /<\/html>\s*$/i.test(html),
        stopReason: salesResult.stopReason,
      });

      return send(res, 502, {
        error: 'Claude a renvoyé une page de vente incomplète.',
      });
    }

    if (!isCompleteHtml(upsellHtml, 1800)) {
      console.error('Incomplete upsell page returned by Claude', {
        length: upsellHtml.length,
        startsWithDoctype: /^<!doctype html>/i.test(upsellHtml),
        endsWithHtml: /<\/html>\s*$/i.test(upsellHtml),
        stopReason: upsellResult.stopReason,
      });

      return send(res, 502, {
        error: 'Claude a renvoyé une page upsell incomplète.',
      });
    }

    console.log('Sales funnel generated successfully', {
      salesLength: html.length,
      upsellLength: upsellHtml.length,
    });

    return send(res, 200, {
      html,
      upsellHtml,
    });
  } catch (error) {
    console.error('Sales route failed', {
      message: error?.message || String(error),
    });

    if (error?.message === 'CLAUDE_API_ERROR') {
      return send(res, 502, {
        error: 'Claude n’a pas pu terminer la génération.',
      });
    }

    return send(res, 500, {
      error: 'Erreur temporaire du générateur de page de vente.',
    });
  }
}
