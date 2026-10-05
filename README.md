# CarStudio shop demo

A responsive, light-interface automotive customization workspace for wrap, tint, wheel, and customization shops. Tint offers two groupings: all windows matching or individual glass areas. One large vehicle shade sample updates to show the selected VLT. A review step lets staff confirm the customer vehicle, photos, and modifications before generation. Caliper color has a live visual preview. The photo upload guide shows recommended angles and reminds staff to wipe the camera lens. Projects and concepts are stored in the current browser's IndexedDB. Customer images are sent to the configured image API only when a preview is generated.

## Run locally

Requires Node.js 20+.

```sh
npm start
```

Open `http://localhost:10000`. For AI generation, configure server-only `GEMINI_API_KEY` and `CARSTUDIO_DEMO_CODE` environment variables. Never add these secrets to browser JavaScript or commit them. CarStudio uses Gemini's `gemini-3.1-flash-image` model by default; `GEMINI_IMAGE_MODEL` can select another image model enabled for your account. If `GEMINI_API_KEY` is absent, the existing OpenAI image integration remains available using `OPENAI_API_KEY` and optional `OPENAI_IMAGE_MODEL`.

If no customer photo is uploaded, CarStudio generates a model-based reference from year, make, model, and trim, then edits that reference. Such an image is clearly labeled as AI-created and cannot represent the exact customer's vehicle. Use Additional for close-ups or a cabin photo when you want an interior-side tint reference. Photo labels are Front, Side, Rear, and Additional.

## Render

`render.yaml` defines a Render Static Site frontend and a Node API service. The static frontend sends image-generation requests to the API service. Set `GEMINI_API_KEY` and `CARSTUDIO_DEMO_CODE` as Render secrets on `carstudio-api`. The Gemini key stays on the API server and is never sent to browsers. Keep demo-code distribution separate from the public URL. Render's free/starter service and image API use may incur separate limits/costs depending on the selected plan and account.

## Current demo scope

Project records are local to a browser/device; there is no shop login, shared cloud database, or multi-tenant customer data storage in this demo. The AI endpoint has a per-IP generation limit. The production image flow needs valid server-side credentials. The Render deployment uses CORS restricted to the static site origin.
