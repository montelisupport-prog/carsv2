# CarStudio shop demo

A responsive, light-interface automotive customization workspace for wrap, tint, wheel, and body shops. Tint uses high-contrast visual shade cards with all-glass, paired-side-window, and individual-area grouping; front side windows, rear side windows, windshield, and rear windshield remain independently configurable. Wheel choices use visual spoke illustrations and plain-language descriptions. Stance includes ride-height diagrams and a vehicle-specific side-reference flow. Caliper color has a live visual preview. The photo upload guide shows recommended angles and reminds staff to wipe the camera lens. Each modification category clearly shows whether it is included. Projects and concepts are stored in the current browser's IndexedDB. Customer images are sent to the configured OpenAI Images API only when a preview is generated.

## Run locally

Requires Node.js 20+.

```sh
npm start
```

Open `http://localhost:10000`. For AI generation, configure server-only `OPENAI_API_KEY` and `CARSTUDIO_DEMO_CODE` environment variables. Never add these secrets to browser JavaScript or commit them. `OPENAI_IMAGE_MODEL` can optionally select an image model available to your API account.

If no customer photo is uploaded, CarStudio generates a model-based reference from year, make, model, and trim, then edits that reference. Such an image is clearly labeled as AI-created and cannot represent the exact customer's vehicle. Select Interior to generate/use an interior reference for tint comparisons.

## Render

`render.yaml` defines a Render Static Site frontend and a Node API service. The static frontend sends image-generation requests to the API service. Set `OPENAI_API_KEY` and `CARSTUDIO_DEMO_CODE` as Render secrets on `carstudio-api`. Keep demo-code distribution separate from the public URL. Render's free/starter service and image API use may incur separate limits/costs depending on the selected plan and account.

## Current demo scope

Project records are local to a browser/device; there is no shop login, shared cloud database, or multi-tenant customer data storage in this demo. The AI endpoint has a per-IP generation limit. The production image flow needs valid server-side credentials. The Render deployment uses CORS restricted to the static site origin.
