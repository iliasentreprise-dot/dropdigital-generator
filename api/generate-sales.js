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
    const offer = req.body?.offer || {};
    const orderBump = req.body?.orderBump || {};

    const colors = theme?.colors || {};
    const artDirection = theme?.artDirection || {};

    const freeLovablePrompt = String(
      req.body?.lovablePrompt || product.prompt_lovable || ''
    ).trim();

    const ebookContent = String(
      req.body?.ebookContent ||
      (Array.isArray(product.chapitres)
        ? product.chapitres.map(chapter => [
            `CHAPITRE ${chapter.n || ''} : ${chapter.t || ''}`,
            chapter.st || '',
            '',
            chapter.c || ''
          ].join('\\n')).join('\\n\\n---\\n\\n')
        : '')
    ).trim();

    const productTitle = String(
      offer.title ||
      product.titre_produit ||
      brief.offre ||
      product.title ||
      ''
    ).trim();

    const productPrice = String(
      offer.price ||
      product.prix ||
      ''
    ).trim();

    const referencePrice = String(
      offer.referencePrice ||
      product.prix_barre ||
      ''
    ).trim();

    const currency = String(
      offer.currency || 'EUR'
    ).trim();

    const bumpPrice = Number(orderBump.price) || 7.8;
    const bumpIdea = String(orderBump.idea || '').trim();

    const salesPrompt = `
TU ES UNE ÉQUIPE SENIOR COMPLÈTE :
- directeur artistique digital
- UX/UI designer expert en conversion
- copywriter direct-response francophone
- stratège marketing
- développeur front-end senior
- analyste de contenu

MISSION :
Créer UNIQUEMENT la page de vente principale complète de ce produit.

Le niveau attendu est celui d'une excellente landing page conçue avec Lovable, Framer ou par une agence digitale premium.

La page doit être originale et spécifique au produit.
Ne produis pas mécaniquement un template "hero + 3 cartes + FAQ".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. OFFRE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Produit :
${productTitle}

Prix réel :
${productPrice} ${currency}

Prix de référence :
${referencePrice || 'non défini'} ${currency}

Le prix réel ci-dessus est la source de vérité.
Ne le remplace jamais par un prix inventé.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2. QUESTIONNAIRE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${JSON.stringify(brief, null, 2)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3. INFORMATIONS PRODUIT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${JSON.stringify({
  titre_produit: product.titre_produit,
  sous_titre: product.sous_titre,
  avatar: product.avatar,
  histoire_cible: product.histoire_cible,
  douleurs_profondes: product.douleurs_profondes,
  desirs_profonds: product.desirs_profonds,
  promesse: product.promesse,
  garantie: product.garantie,
  problemes: product.problemes,
  modules: product.modules,
  temoignages: product.temoignages,
  faq: product.faq
}, null, 2)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4. EBOOK COMPLET
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Voici le véritable contenu vendu.

===== DÉBUT EBOOK =====

${ebookContent}

===== FIN EBOOK =====

AVANT de créer la page, analyse silencieusement l'ebook.

Comprends notamment :
- cible exacte
- niveau de conscience
- problème central
- frustrations
- peurs
- objections
- désirs
- transformation recherchée
- erreurs courantes
- solutions déjà essayées
- mécanisme central
- nouvelle perspective
- étapes de la méthode
- concepts importants
- chapitres les plus vendeurs
- bénéfices concrets
- vocabulaire de la cible
- éléments pouvant être visualisés

Le copywriting doit montrer que la page a été conçue APRÈS lecture de l'ebook.

Évite les formulations génériques lorsqu'une formulation spécifique au contenu existe.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5. IDENTITÉ VISUELLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

COULEUR SOURCE :
${theme.seed || colors.seed || colors.primary || theme.p || ''}

PALETTE :

Primary :
${colors.primary || theme.p || ''}

Primary Dark :
${colors.primaryDark || ''}

Primary Light :
${colors.primaryLight || ''}

Analogous Left :
${colors.analogousLeft || ''}

Analogous Right :
${colors.analogousRight || ''}

Complementary :
${colors.complementary || ''}

Accent :
${colors.accent || theme.a || ''}

Background :
${colors.background || theme.bg || ''}

Background Alt :
${colors.backgroundAlt || theme.bg2 || ''}

Surface :
${colors.surface || ''}

Surface Elevated :
${colors.surfaceElevated || ''}

Border :
${colors.border || ''}

Text :
${colors.text || theme.txt || '#ffffff'}

Text Muted :
${colors.textMuted || ''}

DIRECTION ARTISTIQUE :

Univers :
${artDirection.label || theme.n || ''}

Ambiance :
${artDirection.mood || ''}

Typographie :
${artDirection.typography || theme.typography || ''}

Motifs :
${artDirection.motif || theme.motif || ''}

Layout :
${artDirection.layout || theme.layout || ''}

Cette identité constitue la marque du projet.

Utilise :
- Primary pour la reconnaissance
- Primary Dark / Light pour la profondeur
- Analogous pour les variations
- Complementary / Accent pour les points d'attention
- Background / Surface pour structurer la page
- Text / Text Muted pour la lisibilité

Le résultat ne doit être ni monochrome ni arc-en-ciel.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
6. DIRECTION ARTISTIQUE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Crée une personnalité graphique spécifique à CETTE niche et à CET ebook.

Travaille réellement :
- composition
- hiérarchie typographique
- espaces
- rythme
- profondeur
- cartes
- bordures
- ombres
- textures CSS
- séparateurs
- badges
- boutons
- hover states
- micro-interactions
- transitions
- asymétries lorsque pertinentes
- sections full-width lorsque pertinentes
- éléments sticky lorsque pertinents

Le mobile doit être conçu comme une vraie expérience mobile.

N'utilise pas automatiquement :
- esthétique SaaS noire
- néons violets
- grilles tech
- trois cartes identiques
- gradients arbitraires

La niche et le contenu déterminent le design.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
7. HERO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Le hero doit immédiatement faire comprendre :
- à qui s'adresse le produit
- quel problème il traite
- quelle transformation est recherchée
- pourquoi cette approche est différente
- ce que l'acheteur reçoit

Crée une représentation premium du produit.

Selon la niche, tu peux construire en HTML/CSS :
- couverture ebook
- stack de pages
- modules
- cartes
- smartphone
- interface
- dashboard
- représentation graphique de la méthode
- éléments flottants

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
8. PARCOURS DE CONVERSION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Construis une progression narrative logique à partir du contenu.

Par exemple :

PROBLÈME
↓
COMPRÉHENSION
↓
POURQUOI LES SOLUTIONS HABITUELLES BLOQUENT
↓
NOUVELLE PERSPECTIVE
↓
MÉCANISME
↓
MÉTHODE
↓
PRODUIT
↓
CONTENU
↓
TRANSFORMATION
↓
VALEUR
↓
OBJECTIONS
↓
OFFRE
↓
ACHAT

Adapte la structure au produit.

Transforme plusieurs vrais chapitres en modules visuels ou sections intéressantes.

Ne révèle pas l'intégralité de l'ebook.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
9. PREUVES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Tu peux exploiter les informations déjà fournies dans les données produit.

N'invente pas de nouvelles preuves présentées comme réelles.

N'ajoute pas spontanément :
- témoignages supplémentaires
- statistiques
- chiffres de résultats
- logos clients
- nombre de clients
- récompenses

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
10. CHECKOUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

La zone d'achat doit porter exactement :

id="checkout"

Tous les CTA majeurs doivent pointer vers :

#checkout

Affiche clairement :

Produit :
${productTitle}

Prix :
${productPrice} ${currency}

${referencePrice ? `Prix de référence : ${referencePrice} ${currency}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
11. ORDER BUMP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Dans le checkout, crée un bloc portant exactement :

id="order-bump"

La checkbox doit être NON COCHÉE par défaut.

Prix EXACT du bump :

${bumpPrice} ${currency}

${bumpIdea
  ? `Idée fournie par l'utilisateur : ${bumpIdea}`
  : `Aucune idée manuelle n'a été fournie.

Analyse l'ebook et crée UNE offre complémentaire logique.

Elle doit accélérer, simplifier ou compléter l'utilisation du produit principal sans simplement répéter son contenu.`}

Le bump doit contenir :
- nom précis
- courte promesse
- 2 à 4 bénéfices
- prix
- checkbox

Affiche :
- total sans bump
- total avec bump

Ajoute du JavaScript natif qui met immédiatement le total à jour lorsque la checkbox change.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
12. QUALITÉ TECHNIQUE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Document HTML autonome.

HTML + CSS + JavaScript natif.

Responsive :
- desktop
- tablette
- mobile

Design riche mais rapide.

Animations CSS légères et pertinentes autorisées.

Le HTML doit être directement visualisable dans un navigateur.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
13. CONTEXTE LOVABLE HISTORIQUE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${freeLovablePrompt}

Ce contexte est SECONDAIRE.

Si celui-ci contient un ancien prix, une ancienne palette ou une instruction contradictoire, les données explicites du présent prompt ont priorité.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
14. CONTRÔLE FINAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Avant de répondre, vérifie silencieusement :
- ebook réellement exploité
- copywriting spécifique
- design spécifique
- palette respectée
- prix correct
- id="checkout" présent
- id="order-bump" présent
- checkbox non cochée
- total dynamique
- CTA majeurs vers #checkout
- responsive
- document complet
- aucune section coupée

FORMAT ABSOLU :

Commence EXACTEMENT par :
<!doctype html>

Termine EXACTEMENT par :
</html>

Aucun Markdown.
Aucune explication.
Aucun texte avant le doctype.
Aucun texte après </html>.

Ne génère PAS l'upsell ici.
`;

    const upsellPrompt = `
Tu es un directeur artistique digital, copywriter de conversion francophone et développeur front-end senior.

Crée UNIQUEMENT l'UPSELL 1 après l'achat de :

${productTitle}

Le client possède déjà le produit principal.

QUESTIONNAIRE :
${JSON.stringify(brief, null, 2)}

PRODUIT :
${JSON.stringify({
  titre: productTitle,
  promesse: product.promesse,
  avatar: product.avatar,
  douleurs: product.douleurs_profondes,
  desirs: product.desirs_profonds,
  modules: product.modules
}, null, 2)}

EXTRAIT DU CONTENU :
${ebookContent.slice(0,18000)}

IDENTITÉ VISUELLE :

Primary :
${colors.primary || theme.p || ''}

Primary Dark :
${colors.primaryDark || ''}

Primary Light :
${colors.primaryLight || ''}

Accent :
${colors.accent || theme.a || ''}

Background :
${colors.background || theme.bg || ''}

Surface :
${colors.surface || ''}

Text :
${colors.text || theme.txt || ''}

Univers :
${artDirection.label || theme.n || ''}

Ambiance :
${artDirection.mood || ''}

L'upsell appartient exactement à la même marque que la page principale.

Il doit être plus concentré et direct.

Tu n'es PAS obligé d'utiliser un fond blanc.

Crée UNE offre complémentaire logique répondant à :

"Maintenant que j'ai acheté le produit principal, qu'est-ce qui peut m'aider à obtenir le résultat plus vite, plus facilement ou avec davantage d'accompagnement ?"

Ne revends pas simplement le même contenu.

La page doit inclure :
- grand titre commençant par "Attends…"
- rappel très court de l'achat
- nouvelle opportunité
- explication du complément
- 3 à 6 bénéfices
- contenu de l'offre
- prix
- CTA principal
- lien "Non merci"
- FAQ courte

Le CTA principal doit pointer exactement vers :

#upsell-checkout

Le JavaScript doit récupérer :

customerId

et :

paymentMethodId

avec :

new URLSearchParams(window.location.search)

HTML autonome.
Responsive.
Design premium.

Commence EXACTEMENT par :
<!doctype html>

Termine EXACTEMENT par :
</html>

Aucun Markdown.
Aucune explication.
Aucun texte hors HTML.
`;

    console.log('Starting Claude funnel generation');

    const [salesResult, upsellResult] = await Promise.all([
      callClaude(salesPrompt, 32000),
      callClaude(upsellPrompt, 12000),
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
