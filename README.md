# CarStudio shop workspace

A responsive, light-interface automotive customization workspace for wrap, tint, wheel, and customization shops. Tint offers two groupings: all windows matching or individual glass areas. One large vehicle shade sample updates to show the selected VLT. A review step lets staff confirm the customer vehicle, photos, and modifications before generation. Caliper color has a live visual preview. The photo upload guide shows recommended angles and reminds staff to wipe the camera lens. Projects and concepts are stored in the current browser's IndexedDB. Customer images are sent to the configured image API only when a preview is generated.

## Run locally

Requires Node.js 20+.

```sh
npm start
```

Open `http://localhost:10000`. For AI generation, configure the server-only `GEMINI_API_KEY` environment variable. Never add this secret to browser JavaScript or commit it. CarStudio uses Gemini's `gemini-3.1-flash-image` model by default; `GEMINI_IMAGE_MODEL` can select another image model enabled for your account. If `GEMINI_API_KEY` is absent, the existing OpenAI image integration remains available using `OPENAI_API_KEY` and optional `OPENAI_IMAGE_MODEL`.

If no customer photo is uploaded, CarStudio generates a model-based reference from year, make, model, and trim, then edits that reference. Such an image is clearly labeled as AI-created and cannot represent the exact customer's vehicle. Use Additional for close-ups or a cabin photo when you want an interior-side tint reference. Photo labels are Front, Side, Rear, and Additional.

## Render

`render.yaml` defines a Render Static Site frontend and a Node API service. The static frontend sends image-generation requests to the API service. Set `GEMINI_API_KEY` as a Render secret on `carstudio-api`. The Gemini key stays on the API server and is never sent to browsers. Image generation has no CarStudio preview counter or access code; Google AI Studio quota, account billing, and provider availability still apply.

## Current workspace scope

Project records are local to a browser/device. Shop login, shared cloud storage, and per-shop workspaces are not yet implemented. The Render API accepts generation requests from the configured static site origin and requires valid server-side AI credentials.
