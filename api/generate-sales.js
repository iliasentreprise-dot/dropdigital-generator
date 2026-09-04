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
  let value = String(text || '')
    .trim()
    .replace(/^```html\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  // Si Claude ajoute accidentellement une phrase avant/après le HTML,
  // on extrait uniquement le vrai document.
  const start = value.search(/<!doctype html>/i);
  const lower = value.toLowerCase();
  const end = lower.lastIndexOf('</html>');

  if (start >= 0 && end >= start) {
    value = value.slice(start, end + '</html>'.length);
  }

  return value.trim();
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
    const upsell = req.body?.upsell || {};
    const salesVisuals = req.body?.salesVisuals || {};
    const cover = req.body?.cover || product?.cover || {};

    const colors = theme?.colors || {};
    const artDirection = theme?.artDirection || {};

    const mechanism = product?.mecanisme_unique || {};
    const proprietaryMethod = product?.methode_proprietaire || {};
    const visualPlan = Array.isArray(product?.visual_plan)
      ? product.visual_plan
      : [];

    const coverUrl = String(
      cover?.url ||
      product?.cover_url ||
      ''
    ).trim();

    const productType = String(
      product?.type_produit ||
      'méthode'
    ).trim();

    const centralAngle = String(
      product?.angle_central ||
      ''
    ).trim();

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

    const salesContentBrief = Array.isArray(product.chapitres)
      ? product.chapitres.map(chapter => {
          const content = String(chapter.c || '').replace(/\s+/g, ' ').trim();
          return [
            `CHAPITRE ${chapter.n || ''} : ${chapter.t || ''}`,
            chapter.st ? `Objectif : ${chapter.st}` : '',
            content ? `Résumé : ${content.slice(0, 900)}` : ''
          ].filter(Boolean).join('\n');
        }).join('\n\n')
      : ebookContent.slice(0, 6000);

    const productTitle = String(
      offer.title ||
      product.titre_produit ||
      brief.offre ||
      product.title ||
      ''
    ).trim();

    // SOURCES DE VÉRITÉ — Claude ne choisit jamais les prix
    const productPrice = '17.80';
    const referencePrice = '';
    const bumpPrice = 7.80;
    const mainPlusBumpTotal = 25.60;
    const upsellAddonPrice = 47.00;
    const mainPlusUpsellTotal = 64.80;
    const fullFunnelTotal = 72.60;

    const currency = String(
      offer.currency || 'EUR'
    ).trim();

    const bumpIdea = String(orderBump.idea || '').trim();

    const transformationUrl = String(
      salesVisuals?.transformation || ''
    ).trim();

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

RÈGLES DE PRIX ABSOLUES :

Produit seul :
17,80 EUR

Order bump :
+7,80 EUR

Produit + order bump :
25,60 EUR

Upsell additionnel après achat :
+47,00 EUR

Produit principal + upsell :
64,80 EUR

Produit + order bump + upsell :
72,60 EUR

Tu n'as AUCUNE autorisation pour inventer, arrondir ou modifier ces montants.

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

${salesContentBrief}

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
4B. ARCHITECTURE INTELLECTUELLE DU PRODUIT

Tu ne vends PAS un contenu générique.

TYPE DE PRODUIT :
${productType}

ANGLE CENTRAL :
${centralAngle}

MÉCANISME UNIQUE :
${JSON.stringify(mechanism, null, 2)}

MÉTHODE PROPRIÉTAIRE :
${JSON.stringify(proprietaryMethod, null, 2)}

PLAN VISUEL CONÇU EN AMONT :
${JSON.stringify(visualPlan, null, 2)}

Ces données sont prioritaires.

Toute la page doit donner l'impression qu'une vraie propriété intellectuelle a été créée :
- une grande idée,
- un mécanisme identifiable,
- une méthode structurée,
- des étapes cohérentes,
- une logique pédagogique,
- une transformation.

La page doit expliquer POURQUOI la méthode est différente avant de simplement énumérer son contenu.

Ne transforme pas le mécanisme en jargon artificiel.
Explique-le simplement puis matérialise-le visuellement.

RÈGLE DE VOCABULAIRE PROSPECT :

Dans tout le HTML visible par le prospect, ne présente jamais automatiquement le produit comme :
- un ebook,
- un PDF,
- un guide numérique,
- un fichier à télécharger.

Utilise naturellement :
${productType}

ou selon le contexte :
méthode, protocole, système, rituel, programme, plan, formule ou framework.

Le visiteur doit avoir l'impression d'acheter une MÉTHODE, pas un fichier.

4C. COVER OFFICIELLE DU PRODUIT

URL COVER :
${coverUrl || 'COVER INDISPONIBLE'}

Nom du mécanisme :
${String(cover?.mechanismName || mechanism?.nom || '')}

Concept :
${String(cover?.visualConcept || mechanism?.metaphore_visuelle || '')}

${coverUrl ? `
LA COVER EXISTE RÉELLEMENT.

Tu DOIS utiliser exactement cette URL dans le HTML :

${coverUrl}

Règles :
- utilise un véritable <img src="${coverUrl}">
- affiche cette cover au-dessus de la ligne de flottaison
- elle doit être immédiatement visible dans le HERO
- utilise-la comme représentation principale du produit
- tu peux la placer dans un mockup CSS premium, perspective, profondeur, glow subtil ou environnement graphique
- mais NE recrée PAS une autre couverture
- ne remplace pas cette cover par une fausse boîte 3D
- ne remplace pas cette cover par un rectangle CSS contenant le titre
- ne modifie pas l'URL
- conserve un ratio naturel
- utilise object-fit: cover ou contain selon la composition
` : `
La cover n'a pas pu être générée.
Crée uniquement une représentation CSS temporaire cohérente avec la direction artistique.
Ne prétends pas qu'une image réelle existe.
`}

4D. VISUEL OPENAI DE TRANSFORMATION

URL :
${transformationUrl || 'INDISPONIBLE'}

${transformationUrl ? `
Cette image a déjà été générée par OpenAI pour CE produit.

Utilise exactement cette URL dans une section pertinente de transformation,
projection, résultat attendu ou explication visuelle.

Ne la recrée pas en CSS.
Ne modifie pas son URL.
Ne l'utilise pas comme minuscule décoration.
Elle doit avoir un vrai rôle visuel dans la page.
` : `
Aucun visuel de transformation OpenAI n'est disponible.
N'affiche aucun placeholder vide.
`}



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RÈGLE ABSOLUE — PRÉNOM DU CRÉATEUR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Le champ "prenom" présent dans le brief appartient au CRÉATEUR du produit.

Ce prénom est une donnée interne de génération.

INTERDICTION ABSOLUE de l'afficher dans le HTML final.

Il ne doit apparaître NULLE PART :
- page de vente,
- hero,
- footer,
- badge,
- signature,
- crédit auteur,
- "créé par",
- "par [prénom]",
- confirmation,
- checkout,
- upsell,
- témoignage,
- FAQ,
- CTA,
- métadonnée visible.

Même si le prénom semble pertinent comme auteur ou vendeur :
NE L'AFFICHE PAS.

Ne tente jamais de deviner le prénom de l'acheteur.

Si aucun prénom acheteur distinct n'est explicitement fourni,
n'affiche aucun prénom humain personnalisé.

INTERDIT :
"Créé par Ilias"

INTERDIT :
"Ilias présente Femme FATAL"

INTERDIT :
"ILIAS — ACCÈS CONFIRMÉ"

INTERDIT :
"Bienvenue Ilias"

AUTORISÉ :
"✓ ACCÈS CONFIRMÉ"

AUTORISÉ :
"FEMME FATAL — ACCÈS CONFIRMÉ"

Le produit doit fonctionner comme une marque autonome,
sans afficher l'identité personnelle de son créateur.


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
- cover officielle de la méthode
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

Tous les CTA majeurs situés AVANT la zone de commande doivent pointer vers :

#checkout

Dans #checkout, le bouton FINAL de paiement doit porter exactement :

id="checkout-button"

Ce bouton ne doit contenir AUCUNE URL Stripe statique.

INTERDIT :
- href="STRIPE_CONNECT"
- href="STRIPE_LATER"
- href="#STRIPE_LINK"
- lien Stripe inventé
- Payment Link inventé

Le bouton final doit être :

type="button"

et appeler exactement :

onclick="dropdigitalCheckout(event)"

La fonction dropdigitalCheckout est injectée automatiquement par la plateforme Dropdigital.
Ne la recrée pas dans le HTML.

Affiche clairement :

Produit :
${productTitle}

Prix :
${productPrice} ${currency}

${referencePrice ? `Prix de référence : ${referencePrice} ${currency}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
11. ORDER BUMP — INTERACTION PREMIUM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Dans le checkout, crée UNE carte d'order bump portant exactement :

id="order-bump"

La checkbox doit porter exactement :

id="order-bump-checkbox"

IMPORTANT :
L'ORDER BUMP EST SÉLECTIONNÉ PAR DÉFAUT.

Au chargement initial :
- la checkbox possède checked
- le bloc apparaît immédiatement comme sélectionné
- le total affiché est 25,60 €
- le visiteur peut librement décocher l'option

Prix EXACT :

Produit seul :
17,80 EUR

Order bump :
+7,80 EUR

Produit + order bump :
25,60 EUR

Le RECTANGLE ENTIER doit être cliquable.

La solution recommandée est d'utiliser le conteneur comme un véritable <label>
lié à #order-bump-checkbox afin que cliquer :
- sur le texte
- sur le fond
- sur les bénéfices
- sur l'icône
- sur le prix

change naturellement l'état de la checkbox.

Évite le double-toggle JavaScript.

Le bloc ne doit contenir aucun autre bouton ou lien interactif susceptible de casser le comportement du label.

ÉTAT SÉLECTIONNÉ :

Quand la checkbox est cochée :
- ajouter la classe .selected à #order-bump
- bordure plus lumineuse
- glow léger
- fond accentué
- checkbox clairement activée
- petit badge "AJOUTÉ À MA COMMANDE"
- micro-animation subtile

Quand elle est décochée :
- retirer .selected
- style plus neutre
- conserver une excellente lisibilité

Le bloc doit utiliser :
cursor:pointer;
transition douce;
hover subtil.

Le bump doit contenir :
- nom précis
- courte promesse
- 2 à 4 bénéfices
- prix +7,80 €
- checkbox visible
- badge d'état

${bumpIdea
  ? `Idée fournie par l'utilisateur : ${bumpIdea}`
  : `Aucune idée manuelle n'a été fournie.

Analyse le contenu du produit et crée UNE offre complémentaire logique.

Elle doit accélérer, simplifier ou compléter l'utilisation du produit principal sans répéter son contenu.`}

TOTAL DYNAMIQUE :

Utilise exactement :

id="checkout-total"

Valeur initiale :
25,60 €

Quand #order-bump-checkbox est cochée :
25,60 €

Quand elle est décochée :
17,80 €

Le changement doit être immédiat avec JavaScript natif.

Le JavaScript doit écouter l'événement "change" de la checkbox puis :
- mettre à jour #checkout-total
- ajouter ou retirer .selected sur #order-bump

La checkbox doit être initialisée cochée.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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

LA PAGE NE DOIT PAS ÊTRE STATIQUE.

Ajoute obligatoirement plusieurs éléments visuels conçus directement en HTML/CSS/SVG natif.

Selon le mécanisme et le contenu du produit, utilise 3 à 5 éléments pertinents parmi :
- schéma minimaliste du mécanisme
- flèches et connexions entre étapes
- timeline verticale ou horizontale
- cycle circulaire
- jauge de progression
- comparaison de deux états
- diagramme en étapes
- cartes reliées visuellement
- mini graphique stylisé
- chemin visuel de transformation
- illustration conceptuelle construite avec formes CSS
- SVG minimaliste personnalisé

Ces éléments doivent EXPLIQUER le produit, pas simplement décorer la page.

Ils doivent reprendre la palette de la marque.

Évite :
- icônes génériques répétées
- emojis géants
- illustrations stock
- sections constituées uniquement de texte et de rectangles
- même grille répétée à chaque section

MICRO-ANIMATIONS :

Ajoute des animations discrètes et premium :
- apparition progressive au scroll avec IntersectionObserver
- léger mouvement des lignes ou flèches d'un schéma
- glow très subtil
- hover sur cartes
- légère profondeur du mockup produit
- transition douce du checkout et de l'order bump

Aucune animation agressive.

Respecte prefers-reduced-motion.

Le résultat doit donner l'impression d'un site moderne conçu sur Framer ou par une agence créative,
et non d'une page HTML statique générée automatiquement.

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
- checkbox order bump cochée par défaut
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

CONTRAINTE DE TAILLE ABSOLUE :

La page doit être riche visuellement mais le code doit rester COMPACT.

Objectif :
- environ 20 000 à 35 000 caractères HTML maximum,
- CSS mutualisé avec des classes réutilisables,
- aucun style inline gigantesque répété,
- aucun commentaire HTML inutile,
- aucun code dupliqué,
- JavaScript minimal,
- 8 à 11 sections principales maximum.

La priorité absolue est de TERMINER le document.

Tu dois réserver suffisamment de sortie pour toujours écrire :

</body>
</html>

Si tu dois choisir entre ajouter une section supplémentaire et terminer correctement le HTML :
TERMINE LE HTML.
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
${salesContentBrief.slice(0,6000)}

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

PRIX DE L'UPSELL :

L'UPSELL coûte EXACTEMENT :
47,00 EUR

Le client possède déjà le produit principal.

Le CTA doit donc proposer clairement :

AJOUTER CETTE OFFRE — 47,00 €

Ne présente jamais 29,20 EUR comme prix de l'upsell.

Produit principal + upsell :
64,80 EUR

Produit principal + order bump + upsell :
72,60 EUR

N'invente aucun autre prix.



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RÈGLE ABSOLUE — PRÉNOM DU CRÉATEUR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Le champ "prenom" présent dans le brief appartient au CRÉATEUR du produit.

Ce prénom est une donnée interne de génération.

INTERDICTION ABSOLUE de l'afficher dans le HTML final.

Il ne doit apparaître NULLE PART :
- page de vente,
- hero,
- footer,
- badge,
- signature,
- crédit auteur,
- "créé par",
- "par [prénom]",
- confirmation,
- checkout,
- upsell,
- témoignage,
- FAQ,
- CTA,
- métadonnée visible.

Même si le prénom semble pertinent comme auteur ou vendeur :
NE L'AFFICHE PAS.

Ne tente jamais de deviner le prénom de l'acheteur.

Si aucun prénom acheteur distinct n'est explicitement fourni,
n'affiche aucun prénom humain personnalisé.

INTERDIT :
"Créé par Ilias"

INTERDIT :
"Ilias présente Femme FATAL"

INTERDIT :
"ILIAS — ACCÈS CONFIRMÉ"

INTERDIT :
"Bienvenue Ilias"

AUTORISÉ :
"✓ ACCÈS CONFIRMÉ"

AUTORISÉ :
"FEMME FATAL — ACCÈS CONFIRMÉ"

Le produit doit fonctionner comme une marque autonome,
sans afficher l'identité personnelle de son créateur.


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

Le CTA principal doit porter exactement :

id="upsell-accept"

Il doit appeler :

onclick="dropdigitalUpsellAccept(event)"

Le lien de refus doit porter exactement :

id="upsell-decline"

Texte naturel :
"Non merci, continuer sans cette offre"

Il doit appeler :

onclick="dropdigitalUpsellDecline(event)"

N'utilise aucune URL Stripe statique.

Ne crée pas toi-même les fonctions de paiement.
Elles sont injectées automatiquement par Dropdigital.

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

    // PAGE PRINCIPALE D'ABORD.
    // On ne dépense aucun token pour l'upsell tant que la sales page
    // n'est pas correctement terminée.
    const salesResult = await callClaude(salesPrompt, 32000);
    const html = salesResult.text;

    if (!isCompleteHtml(html, 3000)) {
      const diagnostic = {
        length: html.length,
        startsWithDoctype: /^<!doctype html>/i.test(html),
        endsWithHtml: /<\/html>\s*$/i.test(html),
        stopReason: salesResult.stopReason || 'unknown',
      };

      console.error('Incomplete sales page returned by Claude', diagnostic);

      return send(res, 502, {
        error:
          diagnostic.stopReason === 'max_tokens'
            ? 'Claude a atteint sa limite avant de terminer la page de vente.'
            : 'Claude a renvoyé une page de vente incomplète.',
        diagnostic,
      });
    }

    console.log('Sales page validated', {
      length: html.length,
      stopReason: salesResult.stopReason,
    });

    // L'upsell ne démarre qu'après validation de la page principale.
    const upsellResult = await callClaude(upsellPrompt, 12000);
    const upsellHtml = upsellResult.text;

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
