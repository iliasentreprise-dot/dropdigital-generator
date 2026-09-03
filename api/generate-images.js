const SUPABASE_URL = 'https://iauypnxtakkqnjdrhivv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_XVi8hx94UZ5tjeEgL1cI8A_q9t4QjjE';

function send(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function hasProAccess(token) {
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
  });
  if (!userResponse.ok) return false;
  const user = await userResponse.json();
  const url = new URL(`${SUPABASE_URL}/rest/v1/member_subscriptions`);
  url.searchParams.set('user_id', `eq.${user.id}`);
  url.searchParams.set('select', 'plan,status,current_period_end');
  url.searchParams.set('limit', '1');
  const subscriptionResponse = await fetch(url, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
  });
  if (!subscriptionResponse.ok) return false;
  const [subscription] = await subscriptionResponse.json();
  return Boolean(subscription && ['discovery','pro','business'].includes(subscription.plan) && ['active', 'trialing'].includes(subscription.status) && (!subscription.current_period_end || new Date(subscription.current_period_end) > new Date()));
}

function clean(value, max = 500) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);
}

function visualPrompts(product, brief, theme) {
  const colors = theme?.colors || {};
  const artDirection = theme?.artDirection || {};

  const visualPlan = Array.isArray(product?.visual_plan)
    ? product.visual_plan
    : [];

  const mechanism = product?.mecanisme_unique || {};
  const method = product?.methode_proprietaire || {};

  const style = clean(
    artDirection?.label ||
    theme?.n ||
    'éditorial premium'
  );

  const mood = clean(
    artDirection?.mood ||
    'premium, cohérent, éditorial'
  );

  const motif = clean(
    artDirection?.motif ||
    theme?.motif ||
    'formes graphiques élégantes'
  );

  const palette = [
    colors?.primary || theme?.p || '#7a00ff',
    colors?.primaryDark || '',
    colors?.primaryLight || '',
    colors?.analogousLeft || '',
    colors?.analogousRight || '',
    colors?.complementary || '',
    colors?.accent || theme?.a || '#f0b429',
    colors?.background || theme?.bg || '#0d0018',
    colors?.surface || ''
  ]
    .filter(Boolean)
    .map(color => clean(color, 20))
    .join(', ');

  const globalIdentity = `
IDENTITÉ DE LA MÉTHODE

Nom commercial :
${clean(product?.titre_produit, 300)}

Type :
${clean(product?.type_produit || 'méthode', 120)}

Promesse :
${clean(product?.promesse || product?.sous_titre, 500)}

Mécanisme unique :
${clean(mechanism?.nom, 200)}

Idée du mécanisme :
${clean(mechanism?.idee || mechanism?.fonctionnement, 900)}

Métaphore visuelle :
${clean(mechanism?.metaphore_visuelle, 600)}

Méthode propriétaire :
${clean(method?.nom, 200)}

Marché :
${clean(brief?.niche, 200)}

Cible :
${clean(brief?.sousniche, 300)}

DIRECTION ARTISTIQUE GLOBALE

Univers :
${style}

Ambiance :
${mood}

Motif / matière :
${motif}

Palette :
${palette}

Toutes les créations appartiennent EXACTEMENT à la même marque.

La couleur primaire construit l'identité.
Les nuances primaryDark et primaryLight apportent profondeur et hiérarchie.
Les couleurs analogues servent aux variations naturelles.
La couleur complémentaire et l'accent servent uniquement aux points d'attention.

Ne transforme jamais la palette en arc-en-ciel.

La palette doit influencer naturellement :
vêtements, lumière, objets, matières, décors, interfaces, détails graphiques et environnement.

Qualité :
direction artistique de campagne publicitaire premium,
composition sophistiquée,
profondeur,
lumière travaillée,
textures crédibles,
détails fins,
hiérarchie visuelle forte.

Format vertical 2:3.
`;

  const prompts = [];

  for (let index = 0; index < 10; index++) {
    const item = visualPlan.find(v => Number(v?.index) === index) || visualPlan[index] || {};

    const role = clean(item?.role || '', 160);
    const type = clean(item?.type || '', 160);
    const objective = clean(item?.objectif || '', 600);
    const scene = clean(item?.scene || '', 1200);
    const concept = clean(item?.concept || '', 900);
    const composition = clean(item?.composition || '', 900);

    if (index === 0) {
      const title = clean(
        item?.texte_image?.titre ||
        product?.titre_produit,
        220
      );

      const mechanismName = clean(
        item?.texte_image?.mecanisme ||
        mechanism?.nom,
        180
      );

      const subtitle = clean(
        item?.texte_image?.sous_titre ||
        product?.sous_titre,
        220
      );

      prompts.push(`
${globalIdentity}

IMAGE 1 — COVER OFFICIELLE / MINIATURE PRODUIT

C'est LA couverture finale elle-même.
Ce n'est PAS la photographie d'un livre.
Ce n'est PAS un mockup.
Ce n'est PAS une page posée sur une table.

Elle doit fonctionner comme une affiche publicitaire cinématique verticale extrêmement premium.

PROMESSE À INCARNER :
${clean(product?.titre_produit, 300)}

SCÈNE PRINCIPALE :
${scene}

CONCEPT VISUEL :
${concept}

COMPOSITION :
${composition}

OBJECTIF :
${objective}

Le sujet principal doit immédiatement faire comprendre la promesse.

Le mécanisme « ${clean(mechanism?.nom, 200)} » doit être perceptible visuellement à travers la scène, les effets, les symboles, l'environnement ou les éléments graphiques.

Par exemple, si la méthode parle de perte de poids pendant le sommeil :
ne montre PAS une personne faisant du sport ou préparant une salade.
Montre une personne dormant, dans un environnement nocturne, avec une représentation élégante et pédagogique de ce qui se passe pendant cette période.

Même logique pour n'importe quelle autre niche :
l'image doit illustrer l'IDÉE CENTRALE exacte, pas seulement la catégorie générale.

TYPOGRAPHIE INTÉGRÉE À LA COVER :

Titre principal EXACT :
« ${title} »

Nom du mécanisme :
« ${mechanismName} »

Sous-titre éventuel :
« ${subtitle} »

Le titre doit être très lisible, dominant, intégré à la composition et traité comme une vraie identité éditoriale premium.

Le texte ne doit pas être minuscule.
Évite les paragraphes.
Maximum quelques lignes puissantes.

Ajoute seulement si pertinent :
courbes,
petits indicateurs,
symboles,
chrono,
diagrammes subtils,
badges,
annotations très courtes,
éléments scientifiques ou techniques stylisés.

Référence de niveau :
campagne de lancement premium,
cover de programme haut de gamme,
poster éditorial moderne,
publicité digitale cinématique.

Pas de template Canva générique.
Pas de document Word.
Pas de couverture minimaliste vide.
Pas de livre ouvert.
Pas de photo stock générique.
`);

      continue;
    }

    prompts.push(`
${globalIdentity}

IMAGE ${index + 1} — VISUEL ÉDITORIAL

Rôle :
${role}

Type :
${type}

Objectif pédagogique / narratif :
${objective}

Scène :
${scene}

Concept à faire comprendre :
${concept}

Composition :
${composition}

Ce visuel doit être directement relié au mécanisme unique et à la méthode propriétaire.

Il doit soit :
- expliquer,
- démontrer,
- contextualiser,
- montrer une étape,
- représenter un processus,
- visualiser une routine,
- comparer,
- symboliser une transformation,

mais jamais simplement décorer.

Respecte réellement le type demandé.

Si le type est un diagramme :
construis une composition pédagogique claire avec formes, flèches, zones, connexions et hiérarchie visuelle.

Si le type est une timeline :
fais comprendre une progression temporelle.

Si le type est lifestyle :
montre une vraie situation humaine directement liée à l'action.

Si le type est process :
représente visuellement les étapes du mécanisme.

Si le type est comparaison :
crée deux états visuellement distincts sans tomber dans le cliché.

Si le type est routine :
montre les actions, objets et environnement nécessaires.

Si le type est conceptuel :
matérialise graphiquement l'idée abstraite.

VARIATION OBLIGATOIRE :

Ce visuel ne doit pas avoir la même fonction, le même cadrage, le même décor ou la même composition dominante que le précédent.

Évite la répétition :
personne centrée devant caméra,
portrait identique,
même chambre,
même cuisine,
même bureau,
même angle,
même symbole.

Utilise le langage visuel commun de la marque sans répéter la même image.

Pas de logo.
Pas de filigrane.
Pas de faux texte illisible.

Si du texte est absolument nécessaire pour comprendre un diagramme,
utilise seulement quelques labels français très courts.
Sinon, aucun texte.
`);
  }

  return prompts;
}

async function generateOne(prompt) {
  const requestImage=async model=>fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model,
      prompt,
      size: '1024x1536',
      quality: 'medium',
      output_format: 'webp',
      output_compression: 82
    })
  });
  let response=await requestImage('gpt-image-2');let payload=await response.json();
  const unavailable=!response.ok&&/model|access|not found|unsupported/i.test(`${payload.error?.code||''} ${payload.error?.message||''}`);
  if(unavailable){response=await requestImage('gpt-image-1-mini');payload=await response.json();}
  if (!response.ok || !payload.data?.[0]?.b64_json) {
    const error = new Error(payload.error?.message || 'Image non générée');
    error.code = payload.error?.code || 'image_generation_failed';
    throw error;
  }
  return `data:image/webp;base64,${payload.data[0].b64_json}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Méthode non autorisée.' });
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token || !(await hasProAccess(token))) return send(res, 403, { error: 'Le plan Pro actif est requis.' });
    if (!process.env.OPENAI_API_KEY) return send(res, 503, { error: 'Le moteur d’images est en cours de configuration.' });
    const product = req.body?.product || {};
    const prompts = visualPrompts(product, req.body?.brief || {}, req.body?.theme || {});
    const requestedIndex=Number(req.body?.index);
    if(Number.isInteger(requestedIndex)&&requestedIndex>=0&&requestedIndex<prompts.length){
      const illustration=await generateOne(prompts[requestedIndex]);
      return send(res,200,{illustration,index:requestedIndex});
    }
    const illustrations = [];
    for (const prompt of prompts) illustrations.push(await generateOne(prompt));
    return send(res, 200, { illustrations });
  } catch (error) {
    console.error('Image generation failed', error?.code || error);
    return send(res, 502, { error: 'Les illustrations n’ont pas pu être terminées. Réessaie dans un instant.' });
  }
}
