import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const MAX_BODY = 10 * 1024 * 1024;
const MIME = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon'};

function send(res, status, payload) {
  res.writeHead(status, {'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
  res.end(JSON.stringify(payload));
}
async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > MAX_BODY) throw Object.assign(new Error('Request too large'), {status:413});
  }
  try { return JSON.parse(raw || '{}'); }
  catch { throw Object.assign(new Error('Request body must be valid JSON'), {status:400}); }
}
const clean = (value, limit=160) => String(value || '').replace(/[\r\n<>]/g,' ').trim().slice(0,limit);
function vehicleLabel(config) { return [config.year, config.make, config.model, config.trim].map(x=>clean(x,50)).filter(Boolean).join(' ') || 'customer vehicle'; }
function makeSpecs(config) {
  const mods = Array.isArray(config.modifications) ? config.modifications.slice(0,30) : [];
  return mods.map(x=>`- ${clean(x,120)}`).filter(Boolean);
}
function tintAccuracyInstructions(specs) {
  if (!specs.some(spec=>/\bVLT tint\b/i.test(spec))) return '';
  return [
    'WINDOW TINT ACCURACY: VLT is the exact percentage of visible light that passes through the film. Lower VLT means darker glass; do not mistake the number for a darkness percentage.',
    'Render each listed glass area independently at its specified VLT. Never average shades, reuse one shade across differently specified areas, or let one window selection change another. For example, 15% VLT side glass must look dramatically darker than a 75% VLT windshield.',
    'DAYLIGHT APPEARANCE GUIDE: 5% VLT is limo-dark, near-black from outside; show strong exterior reflections and make seats, dashboard, and cabin details not discernible through that glass. 15% is very dark with the cabin mostly obscured. 20% is dark. 35% is medium-dark. 50% is moderately shaded but visibly lighter than 35%. 70–75% is light and mostly clear, with the cabin readily visible. No tint is clear factory glass.',
    'Apply changes only to the named panes. Keep the windshield, front side windows, rear side windows, and rear windshield separate. Preserve every unlisted pane exactly as it appears in the source.'
  ].join(' ');
}
export function buildBasePrompt(config) {
  const angle = clean(config.angle || 'Front 3/4',40);
  const vehicle = vehicleLabel(config);
  const view = angle.toLowerCase().includes('interior')
    ? 'A realistic interior view through the driver and passenger cabin that clearly shows the side windows from inside the car.'
    : `A full-vehicle automotive photograph from the ${angle} angle, showing the complete vehicle clearly.`;
  const paint = clean(config.currentColor,50);
  return `Create a photorealistic reference photograph of a ${vehicle}. ${view} Respect the known year, make, model, generation, chassis code, and trim styling as closely as possible. Treat any supplied generation or chassis code as the identity of the correct body generation; do not blend neighboring generations or substitute a regional variant. Use the correct factory body style and proportions for that year and model. ${paint ? `Match the current factory paint color: ${paint}.` : 'Use a plausible factory paint color.'} Use factory bodywork and original-looking wheels. Place the vehicle in a restrained, well-lit professional studio with realistic reflections. No people, no text, no invented branding, no body kits, no aftermarket tint or modifications. This image is an AI-created reference because no customer photo was supplied; do not claim it is a photograph of the customer's exact car.`;
}
export function buildEditPrompt(config, variation = false) {
  const specs = makeSpecs(config);
  const vehicle = vehicleLabel(config);
  const angle = clean(config.angle || 'vehicle photo',40);
  const tintSpecs = specs.filter(spec => /\bVLT tint\b/i.test(spec));
  const wrapSpecs = specs.filter(spec => /vehicle color wrap/i.test(spec));
  return [
    'Edit the supplied vehicle photograph for a professional automotive customization shop concept preview.',
    'Preserve the exact source vehicle identity, generation and body style, perspective, camera position, body proportions, existing panels, environment, background, lighting, reflections, and every detail that was not requested to change.',
    'Keep the vehicle at the same apparent size and in the same position in the frame as the source. Preserve the crop and camera distance; do not zoom out, shrink the vehicle, add empty space around it, or change the image aspect ratio.',
    'Do not replace the vehicle, invent a new angle, change the scene, add text or logos, or modify any unselected part.',
    `Vehicle reference: ${vehicle}. Photo view: ${angle}.`,
    config.currentColor ? `The vehicle's current paint color is ${clean(config.currentColor,50)}; preserve it unless a color wrap is selected.` : '',
    'Apply only the selected modifications below, as realistic installed changes that fit this vehicle:',
    specs.length ? specs.join('\n') : '- No requested modifications; preserve the vehicle unchanged.',
    wrapSpecs.length ? 'WRAP COLOR ACCURACY: The hex value in the wrap specification is the exact target color. Match that hue closely on every wrapped painted panel; do not substitute a nearby stock or named color. Finish affects sheen only, not the hue. The hex code is an instruction and must never appear as text in the image.' : '',
    tintAccuracyInstructions(tintSpecs),
    variation ? 'Create a fresh plausible interpretation of the selected finishes while retaining the same vehicle, scene, angle, and all other requested specifications.' : 'Keep the source photograph composition intact and make only the selected changes.',
    'Favor accurate, restrained changes over dramatic redesign. This is a concept visualization, not a certified fitment or color match.'
  ].join('\n');
}
export function buildShotPrompt(config) {
  const vehicle = vehicleLabel(config);
  const rawAngle = String(config.angle || 'alternate 3/4 view');
  const angle = clean(rawAngle,60);
  const isDirectRear = /straight-on rear|direct rear/i.test(rawAngle);
  const specs = makeSpecs(config);
  const tintSpecs = specs.filter(spec => /\bVLT tint\b/i.test(spec));
  return [
    'Create one photorealistic alternate-angle automotive photograph using the supplied generated concept as the single authoritative reference image.',
    `Show the exact same ${vehicle} from the ${angle} camera angle.`,
    isDirectRear ? 'Frame a true straight-on rear detail view from directly behind, with the trunk or rear hatch centered and tail lamps visible. Keep both sides symmetrical; do not mirror, flip, or reuse a rear three-quarter viewpoint.' : '',
    'The supplied reference already contains the approved build. Treat its exact vehicle identity, generation, body panels, paint or wrap color and finish, tint darkness by window area, wheel appearance, caliper color, and every selected detail as locked. Reproduce all of them faithfully; do not reinterpret, remove, add, or change any selected modification.',
    specs.length ? `The approved modifications visible in the reference are: ${specs.join('; ')}.` : '',
    tintAccuracyInstructions(tintSpecs),
    'Only the camera viewpoint may change. Keep the vehicle a similar large size in frame, with realistic body proportions, lighting, reflections, and a matching professional studio environment. Do not add text, logos, people, or unrelated objects.',
    'This is another photograph of the same reference vehicle, not a new design or a fresh vehicle based only on its name.'
  ].filter(Boolean).join('\n');
}
function isImageData(value) { return typeof value === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value); }
function imageFromGemini(data) {
  const parts = data?.candidates?.flatMap(candidate => candidate?.content?.parts || []) || [];
  const part = parts.find(item => item?.inlineData?.data || item?.inline_data?.data);
  if (!part) return null;
  const inline = part.inlineData || part.inline_data;
  const mime = inline.mimeType || inline.mime_type || 'image/png';
  return `data:${mime};base64,${inline.data}`;
}
async function geminiGenerate({prompt, image, env, fetcher}) {
  const model = clean(env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image',100);
  const parts = [{text:prompt}];
  if (image) {
    const encoded = image.slice(image.indexOf(',') + 1);
    const mime = image.slice(5, image.indexOf(';'));
    parts.push({inline_data:{mime_type:mime,data:encoded}});
  }
  const response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method:'POST',
    headers:{'x-goog-api-key':env.GEMINI_API_KEY,'content-type':'application/json'},
    body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{responseModalities:['IMAGE']}})
  });
  const data = await response.json().catch(()=>({}));
  if (!response.ok) {
    const message = data?.error?.message || '';
    if (response.status === 401 || response.status === 403) throw new Error('Gemini rejected the API key or this model is not enabled for the key. Check the Gemini API key and model access.');
    if (response.status === 429) throw Object.assign(new Error('Gemini usage limit reached. Check the API quota and billing, then try again.'),{status:429});
    throw new Error(message || 'Gemini could not generate the image. Check model access and try again.');
  }
  const imageData = imageFromGemini(data);
  if (!imageData) throw new Error('Gemini returned no image. Try a simpler modification or another photo.');
  return imageData;
}
export async function generateOrEdit({body, env, fetcher=fetch}) {
  if (env.GEMINI_API_KEY) {
    const imageSource = isImageData(body.image) ? body.image : null;
    const savedBase = isImageData(body.baseImage) ? body.baseImage : null;
    if (body.shotMode) {
      const reference = imageSource || savedBase;
      if (!reference) throw new Error('Open Shots from a saved concept so its generated image can anchor the other angles.');
      const image = await geminiGenerate({prompt:buildShotPrompt(body),image:reference,env,fetcher});
      return {ok:true,image,originalImage:reference,generatedReference:false};
    }
    let originalImage = imageSource || savedBase;
    if (!originalImage) originalImage = await geminiGenerate({prompt:buildBasePrompt(body),env,fetcher});
    const mods = makeSpecs(body);
    if (!mods.length) return {ok:true,image:originalImage,originalImage,generatedReference:!imageSource&&!savedBase};
    const image = await geminiGenerate({prompt:buildEditPrompt(body,Boolean(body.variation)),image:originalImage,env,fetcher});
    return {ok:true,image,originalImage,generatedReference:!imageSource&&!savedBase};
  }
  const model = env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-sunburst';
  const imageSource = isImageData(body.image) ? body.image : null;
  const savedBase = isImageData(body.baseImage) ? body.baseImage : null;
  if (body.shotMode && !imageSource && !savedBase) throw new Error('Open Shots from a saved concept so its generated image can anchor the other angles.');
  let originalImage = imageSource || savedBase;
  if (!originalImage) {
    const refResponse = await fetcher('https://api.openai.com/v1/images/generations', {
      method:'POST', headers:{authorization:`Bearer ${env.OPENAI_API_KEY}`,'content-type':'application/json'},
      body:JSON.stringify({model,prompt:buildBasePrompt(body),size:'auto',quality:'high',output_format:'png'})
    });
    const refData = await refResponse.json().catch(()=>({}));
    if (!refResponse.ok) return {ok:false,status:refResponse.status,error:'The AI service could not create a vehicle reference. Check model access and try again.'};
    const refB64 = refData?.data?.[0]?.b64_json;
    if (!refB64) return {ok:false,status:502,error:'The AI service returned no vehicle reference. Try again.'};
    originalImage = `data:image/png;base64,${refB64}`;
  }
  const mods = makeSpecs(body);
  if (!mods.length && !body.shotMode) return {ok:true, image:originalImage, originalImage, generatedReference:!imageSource&&!savedBase};
  const form = new FormData();
  form.append('model', model);
  form.append('prompt', body.shotMode ? buildShotPrompt(body) : buildEditPrompt(body,Boolean(body.variation)));
  form.append('size', 'auto');
  form.append('quality', 'high');
  form.append('output_format', 'png');
  const encoded = originalImage.slice(originalImage.indexOf(',') + 1);
  const mime = originalImage.slice(5, originalImage.indexOf(';'));
  const bytes = Buffer.from(encoded, 'base64');
  form.append('image[]', new Blob([bytes], {type:mime}), 'vehicle.png');
  const editResponse = await fetcher('https://api.openai.com/v1/images/edits', {
    method:'POST', headers:{authorization:`Bearer ${env.OPENAI_API_KEY}`}, body:form
  });
  const editData = await editResponse.json().catch(()=>({}));
  if (!editResponse.ok) return {ok:false,status:editResponse.status,error:'The AI edit could not be completed. Check the photo, model access, or usage balance and try again.'};
  const image = editData?.data?.[0]?.b64_json;
  if (!image) return {ok:false,status:502,error:'The AI service returned no edited image. Try again.'};
  return {ok:true,image:`data:image/png;base64,${image}`,originalImage,generatedReference:!imageSource&&!savedBase};
}

export function createServer({fetcher = fetch, env = process.env} = {}) {
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    const allowedOrigins = String(env.CARSTUDIO_ALLOWED_ORIGIN || '').split(',').map(value => value.trim()).filter(Boolean);
    if (origin && (allowedOrigins.includes('*') || allowedOrigins.includes(origin))) {
      res.setHeader('access-control-allow-origin', allowedOrigins.includes('*') ? '*' : origin);
      res.setHeader('vary', 'Origin');
      res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
      res.setHeader('access-control-allow-headers', 'content-type');
      res.setHeader('access-control-max-age', '86400');
    }
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const url = new URL(req.url || '/', 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/api/health') {
      return send(res, 200, {ok:true, aiConfigured:Boolean(env.GEMINI_API_KEY || env.OPENAI_API_KEY), imageProvider:env.GEMINI_API_KEY?'Gemini':env.OPENAI_API_KEY?'OpenAI':null});
    }
    if (req.method === 'POST' && url.pathname === '/api/generate') {
      if (!env.GEMINI_API_KEY && !env.OPENAI_API_KEY) return send(res, 503, {error:'AI image editing is not configured yet. Add GEMINI_API_KEY to the server environment.'});
      let body;
      try { body = await readJson(req); }
      catch (error) { return send(res, error.status || 400, {error:error.message}); }
      if (!clean(body.year,4) || !clean(body.make,50) || !clean(body.model,50)) return send(res,400,{error:'Enter the vehicle year, make, and model before generating.'});
      if (body.image && !isImageData(body.image)) return send(res,400,{error:'The selected source photo is not a supported image.'});
      if (body.baseImage && !isImageData(body.baseImage)) return send(res,400,{error:'The saved vehicle reference is invalid. Regenerate the reference.'});
      if (Buffer.byteLength(body.image || '') > 8 * 1024 * 1024 || Buffer.byteLength(body.baseImage || '') > 8 * 1024 * 1024) return send(res,413,{error:'The photo is too large to process. Choose a smaller image.'});
      try {
        const result = await generateOrEdit({body,env,fetcher});
        if (!result.ok) {
          const status = result.status === 429 ? 429 : 502;
          return send(res,status,{error:result.error});
        }
        return send(res,200,result);
      } catch (error) {
        const status = error?.status === 429 ? 429 : 502;
        const message = error?.message === 'fetch failed' ? 'Could not reach the AI image service. Please retry in a moment.' : error?.message || 'The AI image service could not complete this request.';
        return send(res,status,{error:message});
      }
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res,405,{error:'Method not allowed'});
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { return send(res,400,{error:'Invalid path'}); }
    if (pathname === '/') pathname = '/index.html';
    const safePath = path.resolve(PUBLIC, `.${pathname}`);
    if (!safePath.startsWith(PUBLIC + path.sep)) return send(res,403,{error:'Forbidden'});
    try {
      const file = await fs.readFile(safePath);
      res.writeHead(200,{'content-type':MIME[path.extname(safePath)]||'application/octet-stream','cache-control':path.extname(safePath)==='.html'?'no-cache':'public, max-age=3600','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin'});
      return res.end(req.method==='HEAD'?undefined:file);
    } catch { return send(res,404,{error:'Not found'}); }
  });
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const server = createServer();
  const port = Number(process.env.PORT || 10000);
  server.listen(port,'0.0.0.0',()=>console.log(`CarStudio running on port ${port}`));
}
