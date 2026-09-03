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
  const chapters = Array.isArray(product.chapitres) ? product.chapitres.slice(0, 6) : [];
  const colors = theme?.colors || {};
  const artDirection = theme?.artDirection || {};

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
  const topic=`${clean(brief?.niche)} ${clean(brief?.sousniche)}`.toLowerCase();
  const illustrated=/illustr|dessin|anime|graphique|pastel/i.test(`${style} ${motif}`);
  const base = `Série éditoriale cohérente de niveau magazine international pour un ebook français intitulé « ${clean(product.titre_produit)} », sur ${clean(brief?.niche)} pour ${clean(brief?.sousniche)}.

IDENTITÉ VISUELLE GLOBALE :
- univers : ${style}
- ambiance : ${mood}
- palette : ${palette}
- motif / matière : ${motif}

Toutes les images appartiennent à la même marque et à la même campagne visuelle.

La couleur primaire et ses nuances construisent l'identité principale.
Les couleurs analogues servent aux variations naturelles.
La couleur complémentaire et l'accent servent uniquement aux points d'attention, lumières, accessoires ou petits contrastes.

Ne mets pas toutes les couleurs partout.
Le résultat doit rester élégant, cohérent et reconnaissable.

La palette doit influencer naturellement :
- les vêtements
- les accessoires
- les objets
- les lumières
- les décors
- les matières
- les arrière-plans
- les détails graphiques

Composition verticale 2:3.
Profondeur réelle.
Lumière travaillée.
Matières tactiles.
Cadrage sophistiqué.
Détails très fins.
Espace négatif utile pour la mise en page.

Chaque image doit avoir un sujet, un lieu, un angle et une composition différents tout en conservant exactement le même langage visuel global.

Diversité naturelle des personnes, âges et morphologies lorsque pertinent.

Aucun texte lisible.
Aucune lettre.
Aucun logo.
Aucun filigrane.`;
  const realism = illustrated ? 'Illustration éditoriale haut de gamme, dessin riche et crédible, textures détaillées, jamais enfantin.' : 'Photographie éditoriale photoréaliste, peau et aliments naturels, optique professionnelle, pas de rendu 3D plastique ni de photo stock générique.';
  const weightLoss=/poids|mince|ventre|nutrition|maigr|graisse|silhouette/.test(topic);
  const scenes=weightLoss?[
    'couverture lifestyle : personne confiante préparant une nouvelle routine saine dans une cuisine lumineuse, ingrédients frais au premier plan',
    'table vue du dessus avec planification hebdomadaire, carnet, eau, légumes, protéines et portions équilibrées',
    'assiette équilibrée réellement appétissante, aliments variés et colorés, geste de préparation culinaire',
    'séance de renforcement accessible à la maison, mouvement correct, décor réaliste et dynamique',
    'courses au marché ou au supermarché, comparaison concrète de produits frais et lecture des ingrédients',
    'meal prep réaliste : plusieurs repas différents, contenants élégants, textures alimentaires naturelles',
    'activité cardio douce en extérieur, marche active ou vélo, environnement vivant et lumière matinale',
    'récupération globale : hydratation, sommeil et gestion du stress dans une scène calme sans cliché médical',
    'plan d’action sur sept jours mêlant repas, mouvement et suivi, composition overhead premium',
    'conclusion lifestyle durable : repas partagé, énergie et mouvement, ambiance sincère et accomplie'
  ]:[
    `couverture iconique incarnant ${clean(product.promesse||product.sous_titre)}`,
    'vue d’ensemble de la méthode sous forme de scène réelle organisée et immédiatement compréhensible',
    ...chapters.map(c=>`scène pratique propre au chapitre « ${clean(c.t)} » : ${clean(c.st)}`),
    'plan d’action concret, outils organisés et dynamique de passage à l’action',
    'conclusion ambitieuse et apaisée, résultat durable et nouvelle trajectoire'
  ];
  const prompts = [
    ...scenes.slice(0,10).map((scene,index)=>`${base} ${realism} Image ${index+1} de la série : ${scene}. Ne répète aucun personnage, accessoire dominant ou cadrage des autres images.`)
  ];
  while (prompts.length < 10) prompts.splice(prompts.length - 1, 0, `${base} ${realism} Interlude visuel cohérent sur la progression et la transformation.`);
  return prompts.slice(0, 10);
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
